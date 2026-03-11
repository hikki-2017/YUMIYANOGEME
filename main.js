// ============================================================
// main.js — ゲームメインループ (オートランナー版)
// 一方通行・走り抜けアーチェリーアクション
// ============================================================
import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { spawnEnemiesAhead } from './enemies.js';
import { Arrow, CombatManager } from './combat.js';
import { UpgradeManager } from './upgrades.js';
import { UIManager } from './ui.js';

// ============================================================
// ゲーム設定
// ============================================================
const TOTAL_SECTIONS = 7;     // 全区間数
const BOSS_SECTION = 7;     // ボス区間
const SECTION_DISTANCE = 120;   // 1区間の距離 (m)
const ENEMY_CULL_DISTANCE = 80;    // プレイヤーより後ろ何mで敵を削除するか

// ゲームステート
const STATE = {
    TITLE: 'TITLE',
    PLAYING: 'PLAYING',
    UPGRADE: 'UPGRADE',
    PAUSED: 'PAUSED',
    GAMEOVER: 'GAMEOVER',
    CLEAR: 'CLEAR',
};

// ============================================================
// InputManager
// ============================================================
class InputManager {
    constructor() {
        this._keys = new Set();
        this._justPressed = new Set();
        this._mouseDown = new Set();
        this._onEscape = null;
        this._onEnter = null;

        window.addEventListener('keydown', (e) => {
            if (!this._keys.has(e.code)) this._justPressed.add(e.code);
            this._keys.add(e.code);
            if (e.code === 'Escape') this._onEscape?.();
            if (e.code === 'Enter') this._onEnter?.();
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
                e.preventDefault();
        });
        window.addEventListener('keyup', (e) => { this._keys.delete(e.code); });
        window.addEventListener('mousedown', (e) => { this._mouseDown.add(e.button); });
        window.addEventListener('mouseup', (e) => { this._mouseDown.delete(e.button); });
        window.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    isDown(code) { return this._keys.has(code); }
    wasJustPressed(code) { return this._justPressed.has(code); }
    isMouseDown(btn) { return this._mouseDown.has(btn); }
    flush() { this._justPressed.clear(); }
}

// ============================================================
// Game — メインクラス
// ============================================================
class Game {
    constructor() {
        this.state = STATE.TITLE;
        this.section = 1;

        this._initRenderer();
        this._initScene();

        this.input = new InputManager();
        this.ui = new UIManager();
        this.combat = new CombatManager(this.scene);
        this.upgrade = new UpgradeManager();

        this.player = null;
        this.world = null;
        this.enemies = [];
        this.arrows = [];
        this.enemyBullets = [];
        this._coins3d = [];
        this._sectionSpawned = false;
        this._waitingUpgrade = false;

        this._bindUI();
        this._startLoop();
    }

    // ─── Three.js セットアップ ───
    _initRenderer() {
        this.canvas = document.getElementById('game-canvas');
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        window.addEventListener('resize', () => {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
        });
    }

    _initScene() {
        this.scene = new THREE.Scene();
        // 後方追従カメラ (プレイヤー背後・やや上から前方を見る)
        this.camera = new THREE.PerspectiveCamera(
            60, window.innerWidth / window.innerHeight, 0.1, 160,
        );
        this.camera.position.set(0, 8, 12);
        this.camera.lookAt(0, 0, -5);
    }

    // ─── UIボタン ───
    _bindUI() {
        this.ui.btnStart.addEventListener('click', () => this._startGame());
        this.ui.btnPause.addEventListener('click', () => this._pause());
        this.ui.btnResume.addEventListener('click', () => this._resume());
        this.ui.btnRestart.addEventListener('click', () => this._goTitle());
        this.ui.btnGameoverRestart.addEventListener('click', () => this._startGame());
        this.ui.btnGameoverTitle.addEventListener('click', () => this._goTitle());
        this.ui.btnClearRestart.addEventListener('click', () => this._startGame());
        this.ui.btnClearTitle.addEventListener('click', () => this._goTitle());
        this.input._onEscape = () => {
            if (this.state === STATE.PLAYING) this._pause();
            else if (this.state === STATE.PAUSED) this._resume();
        };
        // Enter キーでタイトルからゲーム開始
        this.input._onEnter = () => {
            if (this.state === STATE.TITLE) this._startGame();
        };
    }

    // ─── ゲーム開始/リセット ───
    _startGame() {
        this._clearScene();
        this.section = 1;
        this.arrows = [];
        this.enemies = [];
        this.enemyBullets = [];
        this._coins3d = [];
        this._sectionSpawned = false;
        this._waitingUpgrade = false;

        this.world = new World(this.scene);
        this.player = new Player(this.scene, this.input);
        this.upgrade.reset();

        // キャンバスにゲームプレイクラスを付与 (pointer-events を有効化)
        this.canvas.classList.add('gameplay');

        // 最初の敵を即スポーン
        this._spawnSection();

        this.state = STATE.PLAYING;
        this.ui.showScreen('hud');
        this.ui.announceSection('Section 1');
        this.ui.updateSection(1, TOTAL_SECTIONS, 0);
    }

    _clearScene() {
        this.arrows.forEach(a => a.destroy?.());
        this.enemyBullets.forEach(b => { if (b.mesh) this.scene.remove(b.mesh); });
        this.enemies.forEach(e => e.dispose?.());
        this._coins3d.forEach(c => this.scene.remove(c.mesh));
        while (this.scene.children.length > 0) this.scene.remove(this.scene.children[0]);
    }

    // ─── 区間の敵をスポーン ───
    _spawnSection() {
        const isBoss = this.section === BOSS_SECTION;
        if (isBoss) {
            // ボス演出
            this.ui.showBossIntro('古代の守護巨人', 2.5, () => {
                this.ui.showScreen('hud');
                this.enemies = spawnEnemiesAhead(this.scene, this.section, true, this.player.position);
                this.ui.announceSection('⚠️ BOSS BATTLE ⚠️');
                this.state = STATE.PLAYING;
            });
            this.state = STATE.PAUSED;
        } else {
            this.enemies = spawnEnemiesAhead(
                this.scene, this.section, false, this.player.position,
            );
        }
        this._sectionSpawned = true;
        this.ui.updateSection(this.section, TOTAL_SECTIONS, this.player?.distanceTraveled ?? 0);
        this.ui.updateEnemyCount(this.enemies.filter(e => e.alive).length);
    }

    // ─── 区間クリア ───
    _onSectionClear() {
        if (this._waitingUpgrade) return;
        this._waitingUpgrade = true;

        if (this.section >= TOTAL_SECTIONS) {
            // 全区間クリア
            this.state = STATE.CLEAR;
            this.ui.showClear(this.player.distanceTraveled, this.player.coins);
            return;
        }

        const choices = this.upgrade.getRoundChoices(this.section);
        this.state = STATE.UPGRADE;
        this.ui.showUpgradeScreen(choices, this.section, (upg) => {
            this.upgrade.select(upg, this.player);
            this.ui.updateUpgradeIcons(this.upgrade.getAcquiredList());
            this.section++;
            this._waitingUpgrade = false;
            this._sectionSpawned = false;

            // 敵・弾を片付けて新区間スポーン
            this.enemies.forEach(e => e.dispose?.());
            this.enemies = [];
            this.enemyBullets.forEach(b => { if (b.mesh) this.scene.remove(b.mesh); });
            this.enemyBullets = [];
            this.arrows.forEach(a => a.destroy?.());
            this.arrows = [];

            this._spawnSection();
            this.state = STATE.PLAYING;
            this.ui.showScreen('hud');
            this.ui.announceSection(`Section ${this.section}`);
        });
    }

    // ─── ポーズ ───
    _pause() {
        this.state = STATE.PAUSED;
        this.canvas.classList.remove('gameplay'); // UIボタンを押せるようにする
        this.ui.showScreen('pause');
    }
    _resume() {
        this.state = STATE.PLAYING;
        this.canvas.classList.add('gameplay');
        this.ui.showScreen('hud');
    }
    _goTitle() {
        this._clearScene();
        this.canvas.classList.remove('gameplay');
        this.state = STATE.TITLE;
        this.ui.showScreen('title');
    }

    // ─── 3Dコイン ───
    _spawnCoin(pos) {
        const mesh = new THREE.Mesh(
            new THREE.TorusGeometry(0.18, 0.07, 5, 8),
            new THREE.MeshLambertMaterial({ color: 0xf5c842 }),
        );
        mesh.position.copy(pos);
        mesh.position.y = 0.3;
        mesh.rotation.x = Math.PI / 2;
        this.scene.add(mesh);
        this._coins3d.push({ mesh, lifetime: 7.0 });
    }

    _updateCoins(dt) {
        for (let i = this._coins3d.length - 1; i >= 0; i--) {
            const coin = this._coins3d[i];
            coin.lifetime -= dt;
            coin.mesh.rotation.y += 2.5 * dt;
            const dist = coin.mesh.position.distanceTo(this.player.position);
            if (dist < 1.6) {
                this.player.addCoins(1);
                this.ui.updateCoins(this.player.coins);
                this.combat.particles.spawnCoinPickup(coin.mesh.position.clone());
                this.scene.remove(coin.mesh);
                this._coins3d.splice(i, 1);
                continue;
            }
            if (coin.lifetime <= 0) {
                this.scene.remove(coin.mesh);
                this._coins3d.splice(i, 1);
            }
        }
    }

    // ─── メインループ ───
    _startLoop() {
        let lastTime = performance.now();
        const loop = (now) => {
            requestAnimationFrame(loop);
            const dt = Math.min((now - lastTime) / 1000, 0.05);
            lastTime = now;

            if (this.state === STATE.PLAYING) this._update(dt);

            // 背後追従カメラ (lerp でなめらかに)
            if (this.player) {
                const p = this.player.position;
                // カメラ目標: プレイヤーの後方 10m、高さ 8m
                const targetPos = new THREE.Vector3(p.x * 0.6, 8, p.z + 10);
                this.camera.position.lerp(targetPos, 0.1);
                // 見る先: プレイヤーより前方 6m
                const lookTarget = new THREE.Vector3(p.x * 0.5, 1, p.z - 6);
                this.camera.lookAt(lookTarget);
            }

            this.renderer.render(this.scene, this.camera);
            this.input.flush();
        };
        requestAnimationFrame(loop);
    }

    // ─── ゲームプレイ毎フレーム ───
    _update(dt) {
        if (!this.player) return;

        // プレイヤー更新
        this.player.update(dt, this.arrows, null);

        // 矢の移動
        for (let i = this.arrows.length - 1; i >= 0; i--) {
            this.arrows[i].update(dt);
            if (!this.arrows[i].alive) this.arrows.splice(i, 1);
        }

        // 敵AIと近接ダメージ
        this.combat.checkMeleeEnemyPlayerCollision(
            this.enemies, this.player, dt, this.enemyBullets,
            (dmg) => this._onPlayerHit(dmg),
        );

        // 敵の弾移動
        this.combat.updateEnemyBullets(this.enemyBullets, dt);

        // 矢→敵 当たり判定
        this.combat.checkArrowEnemyCollisions(
            this.arrows, this.enemies,
            (enemy) => this._onEnemyKilled(enemy),
        );

        // 敵の弾→プレイヤー
        this.combat.checkEnemyBulletsPlayerCollision(
            this.enemyBullets, this.player,
            (dmg) => this._onPlayerHit(dmg),
        );

        // 後方に取り残された敵を削除 (プレイヤーより大幅に後ろ)
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (e.position.z > this.player.position.z + ENEMY_CULL_DISTANCE) {
                e.dispose();
                this.enemies.splice(i, 1);
            }
        }

        // パーティクル
        this.combat.update(dt);

        // コイン
        this._updateCoins(dt);

        // ワールドチャンクのスクロール更新
        this.world.update(this.player.position.z);

        // UI更新
        this.ui.updateHp(this.player.hp, this.player.stats.maxHp);
        this.ui.updateSection(this.section, TOTAL_SECTIONS, this.player.distanceTraveled);

        // プレイヤー死亡
        if (!this.player.alive) {
            this.state = STATE.GAMEOVER;
            this.ui.showGameover(
                this.section, this.player.distanceTraveled,
                this.player.coins, TOTAL_SECTIONS,
            );
            return;
        }

        // 全敵を倒したかチェック
        const aliveCount = this.enemies.filter(e => e.alive).length;
        this.ui.updateEnemyCount(aliveCount);

        if (aliveCount === 0 && this._sectionSpawned && !this._waitingUpgrade) {
            this._onSectionClear();
        }
    }

    _onPlayerHit(damage) {
        if (this.player.takeDamage(damage)) this.ui.flashDamage();
    }

    _onEnemyKilled(enemy) {
        this.combat.particles.spawnDeath(enemy.position.clone().add(new THREE.Vector3(0, 1, 0)));
        const coinCount = enemy.stats.reward?.coins ?? 2;
        for (let c = 0; c < coinCount; c++) {
            this._spawnCoin(enemy.position.clone().add(
                new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5),
            ));
        }
        enemy.group.visible = false;
    }
}

// ─── エントリーポイント ───
const game = new Game();
