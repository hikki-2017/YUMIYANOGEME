// ============================================================
// ui.js — UI管理 (オートランナー版)
// ラウンド表示 → 走行距離 & 区間表示に変更
// ============================================================

export class UIManager {
    constructor() {
        this.screens = {
            title: document.getElementById('screen-title'),
            hud: document.getElementById('screen-hud'),
            upgrade: document.getElementById('screen-upgrade'),
            bossIntro: document.getElementById('screen-boss-intro'),
            pause: document.getElementById('screen-pause'),
            gameover: document.getElementById('screen-gameover'),
            clear: document.getElementById('screen-clear'),
        };

        this._hpBar = document.getElementById('hud-hp-bar');
        this._hpText = document.getElementById('hud-hp-text');
        this._coinCount = document.getElementById('hud-coin-count');
        this._roundText = document.getElementById('hud-round-text');
        this._enemyCount = document.getElementById('hud-enemy-count');
        this._upgradeHud = document.getElementById('hud-upgrades');

        this.btnStart = document.getElementById('btn-start');
        this.btnPause = document.getElementById('btn-pause');
        this.btnResume = document.getElementById('btn-resume');
        this.btnRestart = document.getElementById('btn-restart');
        this.btnGameoverRestart = document.getElementById('btn-gameover-restart');
        this.btnGameoverTitle = document.getElementById('btn-gameover-title');
        this.btnClearRestart = document.getElementById('btn-clear-restart');
        this.btnClearTitle = document.getElementById('btn-clear-title');

        this._damageFlash = document.getElementById('damage-flash');
        this._roundAnnounce = document.getElementById('round-announce');

        this.onUpgradeSelect = null;
    }

    showScreen(name) {
        Object.entries(this.screens).forEach(([k, el]) => {
            el.classList.toggle('active', k === name);
        });
    }

    hideAll() {
        Object.values(this.screens).forEach(el => el.classList.remove('active'));
    }

    // ---------- HUD ----------
    updateHp(hp, maxHp) {
        const pct = Math.max(0, hp / maxHp * 100);
        this._hpBar.style.width = pct + '%';
        this._hpText.textContent = `${Math.ceil(hp)}/${maxHp}`;
        this._hpBar.style.background =
            pct > 50 ? 'linear-gradient(90deg,#e74c3c,#ff6b6b)' :
                pct > 25 ? 'linear-gradient(90deg,#e67e22,#f39c12)' :
                    'linear-gradient(90deg,#c0392b,#e74c3c)';
    }

    updateCoins(coins) {
        this._coinCount.textContent = coins;
    }

    /** オートランナー用: 区間と走行距離を表示 */
    updateSection(section, totalSections, distanceM) {
        this._roundText.textContent =
            `Section ${section}/${totalSections}  📏 ${Math.floor(distanceM)}m`;
    }

    updateEnemyCount(count) {
        this._enemyCount.textContent = count > 0 ? `👹 残り ${count}` : '✅ クリア!';
    }

    updateUpgradeIcons(acquiredList) {
        this._upgradeHud.innerHTML = '';
        acquiredList.slice(-8).forEach(upg => {
            const div = document.createElement('div');
            div.className = 'upgrade-icon';
            div.title = upg.name;
            div.textContent = upg.icon;
            this._upgradeHud.appendChild(div);
        });
    }

    // ---------- アップグレード選択 ----------
    showUpgradeScreen(choices, section, onSelect) {
        this.onUpgradeSelect = onSelect;
        document.getElementById('upgrade-round-info').textContent =
            `Section ${section} クリア！強化を選んでください`;

        const container = document.getElementById('upgrade-cards');
        container.innerHTML = '';
        choices.forEach(upg => {
            const card = document.createElement('div');
            card.className = 'upgrade-card';
            card.innerHTML = `
        <div class="upgrade-card-icon">${upg.icon}</div>
        <div class="upgrade-card-name">${upg.name}</div>
        <div class="upgrade-card-desc">${upg.desc}</div>
        <div class="upgrade-card-rarity rarity-${upg.rarity}">${this._rarityLabel(upg.rarity)}</div>
      `;
            card.addEventListener('click', () => { if (this.onUpgradeSelect) this.onUpgradeSelect(upg); });
            container.appendChild(card);
        });
        this.showScreen('upgrade');
    }

    _rarityLabel(r) {
        return { common: '◆ COMMON', rare: '◆◆ RARE', epic: '◆◆◆ EPIC' }[r] || r;
    }

    // ---------- ボス登場 ----------
    showBossIntro(name, duration, callback) {
        document.getElementById('boss-intro-name').textContent = name;
        this.showScreen('bossIntro');
        setTimeout(() => { this.hideAll(); if (callback) callback(); }, duration * 1000);
    }

    // ---------- ゲームオーバー ----------
    showGameover(section, distanceM, coins, totalSections) {
        document.getElementById('gameover-stats').innerHTML =
            `到達区間: ${section} / ${totalSections}<br>走行距離: ${Math.floor(distanceM)}m<br>獲得コイン: ${coins}`;
        this.showScreen('gameover');
    }

    // ---------- クリア ----------
    showClear(distanceM, coins) {
        document.getElementById('clear-stats').innerHTML =
            `走行距離: ${Math.floor(distanceM)}m<br>獲得コイン: ${coins}`;
        this.showScreen('clear');
    }

    // ---------- エフェクト ----------
    flashDamage() {
        this._damageFlash.classList.remove('flash');
        void this._damageFlash.offsetWidth;
        this._damageFlash.classList.add('flash');
    }

    announceSection(text) {
        this._roundAnnounce.textContent = text;
        this._roundAnnounce.classList.remove('show');
        void this._roundAnnounce.offsetWidth;
        this._roundAnnounce.classList.add('show');
    }
}
