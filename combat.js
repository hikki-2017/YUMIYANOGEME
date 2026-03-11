// ============================================================
// combat.js — 矢・弾・当たり判定・エフェクト
// ============================================================
import * as THREE from 'three';

// ============================================================
// Arrow — プレイヤーが放つ矢
// ============================================================
export class Arrow {
    /**
     * @param {object} opts
     * @param {THREE.Scene}   opts.scene
     * @param {THREE.Vector3} opts.position
     * @param {THREE.Vector3} opts.direction
     * @param {number}  opts.speed
     * @param {number}  opts.damage
     * @param {boolean} opts.isCrit
     * @param {boolean} opts.piercing    — 貫通
     * @param {boolean} opts.bouncing    — 跳弾
     * @param {boolean} opts.explosive   — 爆発
     * @param {number}  opts.lifeSteal   — ライフスティール率 (0〜1)
     * @param {Function} opts.onHeal
     */
    constructor(opts) {
        this.scene = opts.scene;
        this.direction = opts.direction.clone().normalize();
        this.speed = opts.speed;
        this.damage = opts.damage;
        this.isCrit = opts.isCrit;
        this.piercing = opts.piercing || false;
        this.bouncing = opts.bouncing || false;
        this.explosive = opts.explosive || false;
        this.lifeSteal = opts.lifeSteal || 0;
        this.onHeal = opts.onHeal || null;
        this.alive = true;
        this._lifetime = 3.5; // 最大飛行時間(秒)
        this._bounceCount = this.bouncing ? 3 : 0; // 残り跳弾回数
        this._hitEnemies = new Set(); // 貫通時に同じ敵を2度ヒットしない

        this._buildMesh(opts.position);
    }

    _buildMesh(pos) {
        // 矢本体 (長い細いシリンダー)
        const arrowGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.7, 6);
        arrowGeo.rotateX(Math.PI / 2); // Z軸方向に向ける
        const color = this.isCrit ? 0xffeb3b : this.explosive ? 0xff5722 : 0x8bc34a;
        const arrowMat = new THREE.MeshLambertMaterial({ color });
        this.mesh = new THREE.Mesh(arrowGeo, arrowMat);
        this.mesh.position.copy(pos);

        // 矢の向きを飛行方向に合わせる
        const axis = new THREE.Vector3(0, 0, 1);
        this.mesh.quaternion.setFromUnitVectors(axis, this.direction);

        this.scene.add(this.mesh);
    }

    update(dt) {
        if (!this.alive) return;
        this._lifetime -= dt;
        if (this._lifetime <= 0) {
            this.destroy();
            return;
        }
        this.mesh.position.addScaledVector(this.direction, this.speed * dt);
        // フィールド外に出たら消える
        const pos = this.mesh.position;
        if (Math.abs(pos.x) > 62 || Math.abs(pos.z) > 62) {
            this.destroy();
        }
    }

    get position() { return this.mesh.position; }

    // ---------- 敵に当たった ----------
    /**
     * @param {EnemyBase} enemy
     * @param {Function}  spawnHit  — ヒットエフェクトコールバック
     * @param {Function}  spawnExp  — 爆発エフェクトコールバック
     */
    onEnemyHit(enemy, spawnHit, spawnExp) {
        if (!this.alive) return;
        if (this._hitEnemies.has(enemy)) return;
        this._hitEnemies.add(enemy);

        enemy.takeDamage(this.damage);

        // ライフスティール
        if (this.lifeSteal > 0 && this.onHeal) {
            this.onHeal(Math.ceil(this.damage * this.lifeSteal));
        }

        // エフェクト
        if (spawnHit) spawnHit(this.mesh.position.clone(), this.isCrit);

        // 爆発
        if (this.explosive) {
            if (spawnExp) spawnExp(this.mesh.position.clone());
            this.destroy();
            return;
        }

        // 貫通: 矢は消えない
        if (this.piercing) return;

        // 跳弾
        if (this._bounceCount > 0) {
            this._bounceCount--;
            // ランダムに方向転換
            const randYaw = (Math.random() - 0.5) * Math.PI * 1.2;
            this.direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), randYaw);
            const axis = new THREE.Vector3(0, 0, 1);
            this.mesh.quaternion.setFromUnitVectors(axis, this.direction);
            return;
        }

        this.destroy();
    }

    destroy() {
        if (!this.alive) return;
        this.alive = false;
        this.scene.remove(this.mesh);
    }
}

// ============================================================
// ParticleSystem — ヒット/爆発エフェクト
// ============================================================
export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = []; // { mesh, velocity, lifetime, maxLifetime }
    }

    // ---------- ヒットエフェクト ----------
    spawnHit(position, isCrit = false) {
        const count = isCrit ? 12 : 6;
        const color = isCrit ? 0xffeb3b : 0xff7043;
        for (let i = 0; i < count; i++) {
            const geo = new THREE.SphereGeometry(isCrit ? 0.1 : 0.07, 3, 2);
            const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(position);

            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 5,
                Math.random() * 4 + 1,
                (Math.random() - 0.5) * 5,
            );

            const lifetime = 0.25 + Math.random() * 0.2;
            this.particles.push({ mesh, vel, lifetime, maxLifetime: lifetime });
            this.scene.add(mesh);
        }
    }

    // ---------- 爆発エフェクト ----------
    spawnExplosion(position) {
        const count = 20;
        for (let i = 0; i < count; i++) {
            const size = 0.1 + Math.random() * 0.2;
            const geo = new THREE.DodecahedronGeometry(size, 0);
            const col = [0xff5722, 0xff9800, 0xffeb3b][Math.floor(Math.random() * 3)];
            const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(position);

            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 10,
                Math.random() * 6 + 2,
                (Math.random() - 0.5) * 10,
            );
            const lifetime = 0.5 + Math.random() * 0.3;
            this.particles.push({ mesh, vel, lifetime, maxLifetime: lifetime });
            this.scene.add(mesh);
        }
    }

    // ---------- 死亡エフェクト ----------
    spawnDeath(position, color = 0xe53935) {
        const count = 16;
        for (let i = 0; i < count; i++) {
            const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
            const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(position);

            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 8,
                Math.random() * 5 + 3,
                (Math.random() - 0.5) * 8,
            );
            const lifetime = 0.6 + Math.random() * 0.4;
            this.particles.push({ mesh, vel, lifetime, maxLifetime: lifetime });
            this.scene.add(mesh);
        }
    }

    // ---------- コイン取得エフェクト ----------
    spawnCoinPickup(position) {
        const count = 5;
        for (let i = 0; i < count; i++) {
            const geo = new THREE.TorusGeometry(0.08, 0.03, 4, 6);
            const mat = new THREE.MeshBasicMaterial({ color: 0xf5c842, transparent: true, opacity: 1 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(position);
            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 3,
                Math.random() * 4 + 2,
                (Math.random() - 0.5) * 3,
            );
            const lifetime = 0.5;
            this.particles.push({ mesh, vel, lifetime, maxLifetime: lifetime });
            this.scene.add(mesh);
        }
    }

    // ---------- 毎フレーム更新 ----------
    update(dt) {
        const gravity = 9.8;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.lifetime -= dt;
            if (p.lifetime <= 0) {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
                continue;
            }
            p.vel.y -= gravity * dt;
            p.mesh.position.addScaledVector(p.vel, dt);
            p.mesh.material.opacity = p.lifetime / p.maxLifetime;
        }
    }
}

// ============================================================
// CombatManager — 当たり判定の統合管理
// ============================================================
export class CombatManager {
    constructor(scene) {
        this.scene = scene;
        this.particles = new ParticleSystem(scene);
        this._explosionRadius = 3.5;
    }

    /**
     * 矢と敵の当たり判定
     * @param {Arrow[]}      arrows
     * @param {EnemyBase[]}  enemies
     * @param {Function}     onKill(enemy) — 敵撃破コールバック
     */
    checkArrowEnemyCollisions(arrows, enemies, onKill) {
        for (const arrow of arrows) {
            if (!arrow.alive) continue;

            let hitAny = false;
            for (const enemy of enemies) {
                if (!enemy.alive) continue;
                const dist = arrow.position.distanceTo(enemy.position);
                if (dist < enemy.stats.radius + 0.35) {
                    hitAny = true;

                    // 爆発矢の場合は範囲ダメージ
                    if (arrow.explosive) {
                        this._handleExplosion(arrow.position.clone(), enemies, arrow.damage);
                        this.particles.spawnExplosion(arrow.position.clone());
                        arrow.destroy();
                        break;
                    }

                    arrow.onEnemyHit(
                        enemy,
                        (pos, crit) => this.particles.spawnHit(pos, crit),
                        (pos) => {
                            this._handleExplosion(pos, enemies, arrow.damage);
                            this.particles.spawnExplosion(pos);
                        },
                    );

                    if (!enemy.alive && onKill) {
                        onKill(enemy);
                    }

                    if (!arrow.alive) break;
                }
            }
        }
    }

    /**
     * 爆発範囲ダメージ
     */
    _handleExplosion(center, enemies, damage) {
        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const dist = center.distanceTo(enemy.position);
            if (dist < this._explosionRadius) {
                const falloff = 1 - dist / this._explosionRadius;
                enemy.takeDamage(Math.round(damage * falloff));
            }
        }
    }

    /**
     * 敵の弾とプレイヤーの当たり判定
     * @param {object[]}  enemyBullets
     * @param {Player}    player
     * @param {Function}  onHit(damage) — ダメージコールバック
     */
    checkEnemyBulletsPlayerCollision(enemyBullets, player, onHit) {
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const b = enemyBullets[i];
            if (!b.alive) continue;
            const dist = b.position.distanceTo(player.position);
            if (dist < player.radius + 0.2) {
                b.alive = false;
                this.scene.remove(b.mesh);
                if (onHit) onHit(b.damage);
                enemyBullets.splice(i, 1);
            }
        }
    }

    /**
     * 近接敵とプレイヤーの接触ダメージ (update()の戻り値を利用)
     * @param {EnemyBase[]} enemies
     * @param {Player}      player
     * @param {number}      dt
     * @param {Function}    onHit(damage)
     */
    checkMeleeEnemyPlayerCollision(enemies, player, dt, enemyBullets, onHit) {
        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const meleeDmg = enemy.update(dt, player.position, enemyBullets);
            if (meleeDmg > 0) {
                const dist = enemy.position.distanceTo(player.position);
                if (dist < enemy.stats.radius + player.radius) {
                    if (onHit) onHit(meleeDmg);
                }
            }
        }
    }

    /**
     * 敵の弾を毎フレーム移動
     */
    updateEnemyBullets(enemyBullets, dt) {
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const b = enemyBullets[i];
            if (!b.alive) {
                enemyBullets.splice(i, 1);
                continue;
            }
            b.position.addScaledVector(b.direction, b.speed * dt);
            b.mesh.position.copy(b.position);
            // フィールド外
            if (Math.abs(b.position.x) > 62 || Math.abs(b.position.z) > 62) {
                b.alive = false;
                this.scene.remove(b.mesh);
                enemyBullets.splice(i, 1);
            }
        }
    }

    update(dt) {
        this.particles.update(dt);
    }
}
