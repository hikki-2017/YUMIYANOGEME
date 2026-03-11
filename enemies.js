// ============================================================
// enemies.js — 敵キャラクター (オートランナー版)
// 敵はプレイヤーの前方に生成され、後方 (+Z方向) に向かってくる
// ============================================================
import * as THREE from 'three';

// ============================================================
// EnemyBase — 全敵の基底クラス
// ============================================================
export class EnemyBase {
    constructor(scene, position, stats) {
        this.scene = scene;
        this.stats = stats;
        this.hp = stats.maxHp;
        this.alive = true;
        this._stateTimer = 0;

        this.group = new THREE.Group();
        this.group.position.copy(position);
        this.position = this.group.position;
        scene.add(this.group);

        this._buildHpBar();
    }

    _buildHpBar() {
        const bgMat = new THREE.MeshBasicMaterial({ color: 0x333333, depthTest: false });
        this._hpBarBg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.1), bgMat);
        this._hpBarBg.position.set(0, this.stats.hpBarHeight || 2.2, 0);
        this._hpBarBg.renderOrder = 1;
        this.group.add(this._hpBarBg);

        this._hpBarMat = new THREE.MeshBasicMaterial({ color: 0x44ff44, depthTest: false });
        this._hpBarFg = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.08), this._hpBarMat);
        this._hpBarFg.position.set(0, this.stats.hpBarHeight || 2.2, 0.001);
        this._hpBarFg.renderOrder = 2;
        this.group.add(this._hpBarFg);
    }

    _updateHpBar() {
        const ratio = Math.max(0, this.hp / this.stats.maxHp);
        this._hpBarFg.scale.x = ratio;
        this._hpBarFg.position.x = (ratio - 1) * 0.44;
        this._hpBarMat.color.setHex(
            ratio > 0.5 ? 0x44ff44 : ratio > 0.25 ? 0xffaa00 : 0xff2222,
        );
    }

    takeDamage(amount) {
        if (!this.alive) return;
        this.hp -= amount;
        if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    }

    dispose() { this.scene.remove(this.group); }

    // プレイヤーとの距離
    _distTo(target) {
        const dx = target.x - this.position.x;
        const dz = target.z - this.position.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    update(_dt, _playerPos, _enemyBullets) { return 0; }
}

// ============================================================
// MeleeEnemy — 近接雑魚
// プレイヤー前方に出現し、まっすぐ追いかけてくる
// ============================================================
export class MeleeEnemy extends EnemyBase {
    constructor(scene, position, section) {
        const s = 1 + section * 0.15;
        super(scene, position, {
            maxHp: Math.round(28 * s),
            speed: 3.8 + section * 0.2,
            damage: 8 + section * 2,
            attackRange: 1.1,
            attackCooldown: 0.9,
            reward: { coins: 2 + section },
            radius: 0.45,
            hpBarHeight: 1.8,
        });
        this._attackCoolTimer = 0;
        this._buildMesh();
    }

    _buildMesh() {
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0xc62828 });
        const headMat = new THREE.MeshLambertMaterial({ color: 0xff8a80 });
        const hornMat = new THREE.MeshLambertMaterial({ color: 0x212121 });
        this.group.add(
            Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.4), bodyMat),
                { position: new THREE.Vector3(0, 0.45, 0) }),
        );
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 5, 4), headMat);
        head.position.y = 1.05;
        this.group.add(head);
        [-0.1, 0.1].forEach(x => {
            const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), hornMat);
            horn.position.set(x, 1.38, 0);
            this.group.add(horn);
        });
    }

    update(dt, playerPos, _bullets) {
        if (!this.alive) return 0;
        this._attackCoolTimer -= dt;
        this._updateHpBar();

        // プレイヤーに向かって移動
        const dx = playerPos.x - this.position.x;
        const dz = playerPos.z - this.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > this.stats.attackRange) {
            const inv = 1 / dist;
            this.position.x += dx * inv * this.stats.speed * dt;
            this.position.z += dz * inv * this.stats.speed * dt;
            this.group.rotation.y = Math.atan2(dx, dz);
        } else if (this._attackCoolTimer <= 0) {
            this._attackCoolTimer = this.stats.attackCooldown;
            return this.stats.damage;
        }
        return 0;
    }
}

// ============================================================
// RangedEnemy — 遠距離雑魚
// 一定距離に留まりながら弾を発射
// ============================================================
export class RangedEnemy extends EnemyBase {
    constructor(scene, position, section) {
        const s = 1 + section * 0.12;
        super(scene, position, {
            maxHp: Math.round(22 * s),
            speed: 2.5,
            damage: 6 + section * 1.5,
            preferDist: 10,
            attackInterval: 1.8 - Math.min(0.7, section * 0.1),
            reward: { coins: 3 + section },
            radius: 0.4,
            hpBarHeight: 1.9,
        });
        this._shootTimer = 1.2;
        this._buildMesh();
    }

    _buildMesh() {
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x6a1b9a });
        const headMat = new THREE.MeshLambertMaterial({ color: 0xce93d8 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.35), bodyMat);
        body.position.y = 0.425;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 5, 4), headMat);
        head.position.y = 1.0;
        this.group.add(body, head);
    }

    update(dt, playerPos, enemyBullets) {
        if (!this.alive) return 0;
        this._shootTimer -= dt;
        this._updateHpBar();

        const dx = playerPos.x - this.position.x;
        const dz = playerPos.z - this.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const inv = dist > 0.01 ? 1 / dist : 0;

        this.group.rotation.y = Math.atan2(dx, dz);

        // 距離調整
        if (dist < this.stats.preferDist - 1.5) {
            this.position.x -= dx * inv * this.stats.speed * dt;
            this.position.z -= dz * inv * this.stats.speed * dt;
        } else if (dist > this.stats.preferDist + 2) {
            this.position.x += dx * inv * this.stats.speed * dt;
            this.position.z += dz * inv * this.stats.speed * dt;
        }

        // 射撃
        if (this._shootTimer <= 0) {
            this._shootTimer = this.stats.attackInterval;
            const dir = new THREE.Vector3(dx * inv, 0, dz * inv);
            const origin = this.position.clone().add(new THREE.Vector3(0, 0.8, 0));
            enemyBullets.push({
                position: origin,
                direction: dir,
                speed: 8,
                damage: this.stats.damage,
                mesh: this._makeBulletMesh(origin.clone()),
                alive: true,
            });
        }
        return 0;
    }

    _makeBulletMesh(pos) {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.13, 4, 3),
            new THREE.MeshBasicMaterial({ color: 0xff00ff }),
        );
        mesh.position.copy(pos);
        this.scene.add(mesh);
        return mesh;
    }
}

// ============================================================
// ChargeEnemy — 突進雑魚
// 予備動作 → 高速横突進
// ============================================================
export class ChargeEnemy extends EnemyBase {
    constructor(scene, position, section) {
        const s = 1 + section * 0.18;
        super(scene, position, {
            maxHp: Math.round(45 * s),
            speed: 2.2,
            chargeSpeed: 20,
            damage: 20 + section * 2,
            windupTime: 0.9,
            chargeDuration: 0.5,
            cooldown: 2.0,
            reward: { coins: 4 + section },
            radius: 0.6,
            hpBarHeight: 2.0,
        });
        this._phase = 'approach';
        this._phaseTimer = 0;
        this._chargeDir = new THREE.Vector3();
        this._buildMesh();
    }

    _buildMesh() {
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0xe65100 });
        const headMat = new THREE.MeshLambertMaterial({ color: 0xff8f00 });
        const spikeMat = new THREE.MeshLambertMaterial({ color: 0xbf360c });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.0, 0.55), bodyMat);
        body.position.y = 0.5;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 5, 4), headMat);
        head.position.y = 1.2;
        for (let i = 0; i < 3; i++) {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 5), spikeMat);
            spike.position.set((i - 1) * 0.25, 0.9, 0.38);
            spike.rotation.x = -Math.PI / 4;
            this.group.add(spike);
        }
        this.group.add(body, head);
    }

    update(dt, playerPos, _bullets) {
        if (!this.alive) return 0;
        this._phaseTimer -= dt;
        this._updateHpBar();

        const dx = playerPos.x - this.position.x;
        const dz = playerPos.z - this.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const inv = dist > 0.01 ? 1 / dist : 0;

        switch (this._phase) {
            case 'approach':
                this.group.rotation.y = Math.atan2(dx, dz);
                this.position.x += dx * inv * this.stats.speed * dt;
                this.position.z += dz * inv * this.stats.speed * dt;
                if (dist < 12) {
                    this._phase = 'windup';
                    this._phaseTimer = this.stats.windupTime;
                    // 突進方向はプレイヤーに向けて固定
                    this._chargeDir.set(dx * inv, 0, dz * inv);
                }
                break;

            case 'windup':
                // 点滅させて警告
                this.group.rotation.y += 6 * dt;
                if (this._phaseTimer <= 0) {
                    this._phase = 'charging';
                    this._phaseTimer = this.stats.chargeDuration;
                }
                break;

            case 'charging':
                this.position.x += this._chargeDir.x * this.stats.chargeSpeed * dt;
                this.position.z += this._chargeDir.z * this.stats.chargeSpeed * dt;
                if (this._phaseTimer <= 0 || dist < 1.2) {
                    this._phase = 'cooldown';
                    this._phaseTimer = this.stats.cooldown;
                    if (dist < 1.2) return this.stats.damage;
                }
                break;

            case 'cooldown':
                if (this._phaseTimer <= 0) this._phase = 'approach';
                break;
        }
        return 0;
    }
}

// ============================================================
// Boss — 大型ボス
// ============================================================
export class Boss extends EnemyBase {
    constructor(scene, position, section) {
        const s = 1 + section * 0.25;
        super(scene, position, {
            maxHp: Math.round(700 * s),
            speed: 3.0,
            damage: 22 + section * 3,
            attackRange: 2.8,
            attackCooldown: 1.0,
            reward: { coins: 40 + section * 5 },
            radius: 1.6,
            hpBarHeight: 4.5,
        });
        this._phase = 1;
        this._shootTimer = 1.5;
        this._attackCoolTimer = 0;
        this._buildMesh();
    }

    _buildMesh() {
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x37474f });
        const armorMat = new THREE.MeshLambertMaterial({ color: 0x263238 });
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xff6f00 });

        const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 1.0), bodyMat);
        body.position.y = 1.1;
        const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), bodyMat);
        head.position.y = 2.7;
        [-0.95, 0.95].forEach(x => {
            const sh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), armorMat);
            sh.position.set(x, 1.9, 0);
            this.group.add(sh);
        });
        this._eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 3), glowMat);
        this._eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 3), glowMat);
        this._eyeL.position.set(-0.18, 2.78, 0.45);
        this._eyeR.position.set(0.18, 2.78, 0.45);
        this.group.add(body, head, this._eyeL, this._eyeR);
        this.group.scale.set(1.5, 1.5, 1.5);
    }

    _checkPhase() {
        const r = this.hp / this.stats.maxHp;
        if (r <= 0.33 && this._phase < 3) {
            this._phase = 3;
            this._eyeL.material.color.setHex(0xff0000);
            this._eyeR.material.color.setHex(0xff0000);
            this.stats.speed *= 1.35;
        } else if (r <= 0.66 && this._phase < 2) {
            this._phase = 2;
            this._eyeL.material.color.setHex(0xff4400);
            this._eyeR.material.color.setHex(0xff4400);
            this.stats.speed *= 1.18;
        }
    }

    update(dt, playerPos, enemyBullets) {
        if (!this.alive) return 0;
        this._shootTimer -= dt;
        this._attackCoolTimer -= dt;
        this._checkPhase();
        this._updateHpBar();

        const dx = playerPos.x - this.position.x;
        const dz = playerPos.z - this.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const inv = dist > 0.01 ? 1 / dist : 0;
        this.group.rotation.y = Math.atan2(dx, dz);

        if (dist > this.stats.attackRange) {
            this.position.x += dx * inv * this.stats.speed * dt;
            this.position.z += dz * inv * this.stats.speed * dt;
        }

        const bulletCount = this._phase === 1 ? 4 : this._phase === 2 ? 8 : 12;
        const shootInterval = this._phase === 1 ? 2.0 : this._phase === 2 ? 1.4 : 0.9;
        if (this._shootTimer <= 0) {
            this._shootTimer = shootInterval;
            this._radialBullets(bulletCount, enemyBullets);
        }

        let melDmg = 0;
        if (dist < this.stats.attackRange && this._attackCoolTimer <= 0) {
            melDmg = this.stats.damage;
            this._attackCoolTimer = this.stats.attackCooldown;
        }
        return melDmg;
    }

    _radialBullets(count, enemyBullets) {
        const origin = this.position.clone().add(new THREE.Vector3(0, 1.5, 0));
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.18, 5, 4),
                new THREE.MeshBasicMaterial({ color: 0xff6f00 }),
            );
            mesh.position.copy(origin);
            this.scene.add(mesh);
            enemyBullets.push({
                position: origin.clone(), direction: dir, speed: 7,
                damage: this.stats.damage * 0.55, mesh, alive: true
            });
        }
    }
}

// ============================================================
// 区間に応じて前方に敵を生成するファクトリ
// ============================================================
/**
 * @param {THREE.Scene} scene
 * @param {number} section       — 現在区間 (1〜)
 * @param {boolean} isBossSection
 * @param {THREE.Vector3} playerPos — プレイヤーの現在位置
 */
export function spawnEnemiesAhead(scene, section, isBossSection, playerPos) {
    const enemies = [];

    if (isBossSection) {
        // ボス + 小型サポート
        const bossPos = new THREE.Vector3(playerPos.x, 0, playerPos.z - 35);
        enemies.push(new Boss(scene, bossPos, section));
        for (let i = 0; i < 3; i++) {
            enemies.push(new MeleeEnemy(scene, _aheadPos(playerPos, 20, 8), section));
        }
        return enemies;
    }

    // 通常区間: 区間が進むほど数・種類が増加
    const baseCount = 5 + section * 2;
    for (let i = 0; i < baseCount; i++) {
        const roll = Math.random();
        const pos = _aheadPos(playerPos, 18 + i * 3, 8);
        if (section < 2 || roll < 0.50) {
            enemies.push(new MeleeEnemy(scene, pos, section));
        } else if (roll < 0.75) {
            enemies.push(new RangedEnemy(scene, pos, section));
        } else {
            enemies.push(new ChargeEnemy(scene, pos, section));
        }
    }
    return enemies;
}

// プレイヤー前方 (zAhead m先) に少し横散らしした位置を返す
function _aheadPos(playerPos, zAhead, xSpread) {
    return new THREE.Vector3(
        playerPos.x + (Math.random() - 0.5) * xSpread * 2,
        0,
        playerPos.z - zAhead,
    );
}
