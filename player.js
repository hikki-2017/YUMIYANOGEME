// ============================================================
// player.js — プレイヤー (オートランナー版)
// ・前方 (-Z方向) に自動走行
// ・A/D キーで左右によける
// ・クリックで矢を発射
// ・スペースで左右横ダッシュ
// ============================================================
import * as THREE from 'three';
import { Arrow } from './combat.js';

// 初期ステータス
const BASE_STATS = {
    maxHp: 100,
    runSpeed: 10,          // 自動前進速度
    sideSpeed: 6,           // 左右移動速度
    sideLimit: 10,          // 左右移動の限界 (X座標)
    dashSpeed: 16,          // ダッシュ速度
    dashDuration: 0.20,        // ダッシュ継続時間(秒)
    dashCooldown: 0.75,        // ダッシュクールダウン(秒)
    fireRate: 0.40,        // 射撃間隔(秒)
    arrowSpeed: 26,          // 矢の速度
    arrowDamage: 12,          // 矢のダメージ
    critChance: 0.08,        // クリティカル率
    critMult: 2.0,         // クリティカル倍率
    arrowCount: 1,           // 同時発射本数
    spread: 0.05,        // 多本数時の広がり角 (rad)
    lifeSteal: 0,           // ライフスティール率
    piercing: false,
    bouncing: false,
    explosive: false,
    invulnDuration: 0.7,
};

export class Player {
    constructor(scene, input) {
        this.scene = scene;
        this.input = input;
        this.stats = { ...BASE_STATS };
        this.hp = this.stats.maxHp;
        this.coins = 0;
        this.alive = true;

        this._fireCooldown = 0;
        this._dashTimer = 0;
        this._dashCoolTimer = 0;
        this._invulnTimer = 0;
        this._dashDir = new THREE.Vector3();

        // 残像
        this._afterImages = [];
        this._afterImageTimer = 0;

        // 走行距離 (Z方向の絶対移動量)
        this.distanceTraveled = 0;

        this._buildMesh();
    }

    // ---------- メッシュ構築 ----------
    _buildMesh() {
        this.group = new THREE.Group();

        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1565c0 });
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffcc80 });
        const hatMat = new THREE.MeshLambertMaterial({ color: 0x283593 });
        const legMat = new THREE.MeshLambertMaterial({ color: 0x0d47a1 });
        const bowMat = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });

        // 胴体
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.35), bodyMat);
        body.position.y = 0.45;

        // 頭
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), headMat);
        head.position.y = 1.05;

        // 帽子
        const hat = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 6), hatMat);
        hat.position.y = 1.42;

        // 弓
        const bow = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 10, Math.PI), bowMat);
        bow.position.set(0.35, 0.5, 0);
        bow.rotation.y = Math.PI / 2;

        // 脚
        [-0.14, 0.14].forEach(xOff => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), legMat);
            leg.position.set(xOff, 0, 0);
            this.group.add(leg);
        });

        this.group.add(body, head, hat, bow);

        // オートランナーなのでキャラは前向き固定
        this.group.rotation.y = Math.PI; // -Z方向を向く

        this.group.position.set(0, 0, 0);
        this.scene.add(this.group);

        this.radius = 0.4;
        this.position = this.group.position;
    }

    // ---------- 毎フレーム更新 ----------
    update(dt, arrows, _onShoot) {
        if (!this.alive) return;

        // タイマー更新
        if (this._fireCooldown > 0) this._fireCooldown -= dt;
        if (this._dashTimer > 0) this._dashTimer -= dt;
        if (this._dashCoolTimer > 0) this._dashCoolTimer -= dt;
        if (this._invulnTimer > 0) this._invulnTimer -= dt;

        this._updateMovement(dt);
        this._updateShooting(dt, arrows);
        this._updateAfterImages(dt);
    }

    // ---------- 移動 ----------
    _updateMovement(dt) {
        const inp = this.input;

        if (this._dashTimer > 0) {
            // ダッシュ中
            this.position.addScaledVector(this._dashDir, this.stats.dashSpeed * dt);
            // 前進は常に続ける
            this.position.z -= this.stats.runSpeed * dt;
        } else {
            // 自動前進
            const runDelta = this.stats.runSpeed * dt;
            this.position.z -= runDelta;
            this.distanceTraveled += runDelta;

            // A/D で左右
            let dx = 0;
            if (inp.isDown('KeyA') || inp.isDown('ArrowLeft')) dx -= 1;
            if (inp.isDown('KeyD') || inp.isDown('ArrowRight')) dx += 1;
            this.position.x += dx * this.stats.sideSpeed * dt;

            // ダッシュ開始 (Space)
            if (inp.wasJustPressed('Space') && this._dashCoolTimer <= 0) {
                const dashX = dx !== 0 ? dx : (inp.isDown('KeyA') ? -1 : 1);
                this._dashDir.set(dashX, 0, 0).normalize();
                this._dashTimer = this.stats.dashDuration;
                this._dashCoolTimer = this.stats.dashCooldown;
                this._afterImageTimer = 0;
            }
        }

        // 左右ブレ制限
        this.position.x = THREE.MathUtils.clamp(
            this.position.x, -this.stats.sideLimit, this.stats.sideLimit,
        );
    }

    // ---------- 射撃 ----------
    _updateShooting(dt, arrows) {
        if (this.input.isMouseDown(0) && this._fireCooldown <= 0) {
            this._fire(arrows);
            this._fireCooldown = this.stats.fireRate;
        }
    }

    // ---------- 矢を前方に発射 ----------
    _fire(arrows) {
        const origin = this.position.clone().add(new THREE.Vector3(0, 0.7, 0));
        // ベース方向: 前方 (-Z)
        const baseDir = new THREE.Vector3(0, 0, -1);

        const count = this.stats.arrowCount;
        const spread = count > 1 ? this.stats.spread : 0;

        for (let i = 0; i < count; i++) {
            const angle = count > 1 ? (i / (count - 1) - 0.5) * spread * 2 : 0;
            const dir = baseDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);

            const crit = Math.random() < this.stats.critChance;
            const damage = Math.round(this.stats.arrowDamage * (crit ? this.stats.critMult : 1));

            arrows.push(new Arrow({
                scene: this.scene,
                position: origin.clone(),
                direction: dir,
                speed: this.stats.arrowSpeed,
                damage,
                isCrit: crit,
                piercing: this.stats.piercing,
                bouncing: this.stats.bouncing,
                explosive: this.stats.explosive,
                lifeSteal: this.stats.lifeSteal,
                onHeal: (amt) => this.heal(amt),
            }));
        }
    }

    // ---------- 残像 ----------
    _updateAfterImages(dt) {
        if (this._dashTimer > 0) {
            this._afterImageTimer -= dt;
            if (this._afterImageTimer <= 0) {
                this._spawnAfterImage();
                this._afterImageTimer = 0.05;
            }
        }
        for (let i = this._afterImages.length - 1; i >= 0; i--) {
            const img = this._afterImages[i];
            img.lifetime -= dt;
            img.mesh.material.opacity = img.lifetime / 0.22;
            if (img.lifetime <= 0) {
                this.scene.remove(img.mesh);
                this._afterImages.splice(i, 1);
            }
        }
    }

    _spawnAfterImage() {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.9, 0.35),
            new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.5 }),
        );
        mesh.position.copy(this.position);
        mesh.position.y += 0.45;
        mesh.rotation.y = this.group.rotation.y;
        this.scene.add(mesh);
        this._afterImages.push({ mesh, lifetime: 0.22 });
    }

    // ---------- ダメージ ----------
    takeDamage(amount) {
        if (this._invulnTimer > 0 || !this.alive) return false;
        this.hp = Math.max(0, this.hp - amount);
        this._invulnTimer = this.stats.invulnDuration;
        if (this.hp <= 0) this.alive = false;
        return true;
    }

    heal(amount) {
        this.hp = Math.min(this.stats.maxHp, this.hp + amount);
    }

    addCoins(n) { this.coins += n; }

    applyUpgrade(upgrade) {
        upgrade.apply(this.stats, this);
        this.hp = Math.min(this.hp, this.stats.maxHp);
    }

    reset() {
        this.stats = { ...BASE_STATS };
        this.hp = this.stats.maxHp;
        this.coins = 0;
        this.alive = true;
        this.distanceTraveled = 0;
        this._fireCooldown = 0;
        this._dashTimer = 0;
        this._dashCoolTimer = 0;
        this._invulnTimer = 0;
        this.group.position.set(0, 0, 0);
        this._afterImages.forEach(img => this.scene.remove(img.mesh));
        this._afterImages = [];
    }

    get isInvulnerable() { return this._invulnTimer > 0; }
    get isDashing() { return this._dashTimer > 0; }
}
