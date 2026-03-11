// ============================================================
// upgrades.js — アップグレード定義とローグライト強化管理
// ============================================================

// ============================================================
// アップグレード定義テーブル
// 各アップグレードの apply(stats, player) がプレイヤーステータスを変更する
// ============================================================
export const ALL_UPGRADES = [
    // ─────────── COMMON ───────────
    {
        id: 'fire_rate',
        name: '連射強化',
        icon: '⚡',
        desc: '射撃間隔を 20% 短縮する',
        rarity: 'common',
        apply: (s) => { s.fireRate = Math.max(0.08, s.fireRate * 0.80); },
    },
    {
        id: 'damage_up',
        name: '矢の強化',
        icon: '🏹',
        desc: '矢のダメージを +5 増加する',
        rarity: 'common',
        apply: (s) => { s.arrowDamage += 5; },
    },
    {
        id: 'speed_up',
        name: 'フットワーク',
        icon: '💨',
        desc: '移動速度を +1.5 増加する',
        rarity: 'common',
        apply: (s) => { s.speed += 1.5; },
    },
    {
        id: 'hp_up',
        name: '生命力強化',
        icon: '❤️',
        desc: '最大HPを +30 増やし、HP を 20 回復する',
        rarity: 'common',
        apply: (s, p) => {
            s.maxHp += 30;
            if (p) p.heal(20);
        },
    },
    {
        id: 'hp_regen',
        name: '応急回復',
        icon: '🍀',
        desc: 'HP を 40 即時回復する',
        rarity: 'common',
        apply: (s, p) => { if (p) p.heal(40); },
    },
    {
        id: 'dash_up',
        name: '回避強化',
        icon: '🌀',
        desc: '回避クールタウンを 30% 短縮する',
        rarity: 'common',
        apply: (s) => { s.dashCooldown = Math.max(0.3, s.dashCooldown * 0.70); },
    },
    {
        id: 'arrow_speed',
        name: '矢速強化',
        icon: '🚀',
        desc: '矢の速度を +6 増加する',
        rarity: 'common',
        apply: (s) => { s.arrowSpeed += 6; },
    },

    // ─────────── RARE ───────────
    {
        id: 'multi_arrow',
        name: '三本矢',
        icon: '🎯',
        desc: '同時発射数を +1 増やす (最大 5)',
        rarity: 'rare',
        apply: (s) => { s.arrowCount = Math.min(5, s.arrowCount + 1); s.spread = 0.55; },
    },
    {
        id: 'crit_up',
        name: 'クリティカル強化',
        icon: '💥',
        desc: 'クリティカル率 +15%、クリティカル倍率 +0.3',
        rarity: 'rare',
        apply: (s) => { s.critChance = Math.min(0.75, s.critChance + 0.15); s.critMult += 0.3; },
    },
    {
        id: 'life_steal',
        name: '吸血の矢',
        icon: '🩸',
        desc: '矢がヒットした際、ダメージの 12% を HP 回復する',
        rarity: 'rare',
        apply: (s) => { s.lifeSteal = Math.min(0.4, s.lifeSteal + 0.12); },
    },
    {
        id: 'invuln_up',
        name: '不動の盾',
        icon: '🛡️',
        desc: '被弾後の無敵時間を 0.4秒 延長する',
        rarity: 'rare',
        apply: (s) => { s.invulnDuration += 0.4; },
    },

    // ─────────── EPIC ───────────
    {
        id: 'piercing',
        name: '貫通矢',
        icon: '🔱',
        desc: '矢が敵を貫通し、複数の敵を同時に攻撃する',
        rarity: 'epic',
        apply: (s) => { s.piercing = true; },
    },
    {
        id: 'bouncing',
        name: '跳弾矢',
        icon: '🔀',
        desc: '矢が敵に当たった後、3 回跳弾して別の敵に当たる',
        rarity: 'epic',
        apply: (s) => { s.bouncing = true; },
    },
    {
        id: 'explosive',
        name: '爆発矢',
        icon: '💣',
        desc: '矢が着弾時に爆発し、範囲ダメージを与える',
        rarity: 'epic',
        apply: (s) => { s.explosive = true; },
    },
];

// ============================================================
// UpgradeManager — アップグレード選択ロジック
// ============================================================
export class UpgradeManager {
    constructor() {
        // 取得済みアップグレードの履歴
        this.acquired = [];
    }

    /**
     * ラウンド完了時に 3 択候補をランダムに選ぶ
     * - EPIC は稀に出る
     * - 既に取得したものは重複しにくい
     * @param {number} round
     * @returns {object[]} 3 つのアップグレード候補
     */
    getRoundChoices(round) {
        const pool = this._buildPool(round);
        const shuffled = pool.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, 3);
    }

    _buildPool(round) {
        const epicChance = Math.min(0.45, 0.1 + round * 0.05);
        const rareChance = 0.45;

        const available = ALL_UPGRADES.filter(u => {
            // 一部アップグレードは重複適用不可
            if (u.id === 'piercing' && this.acquired.includes('piercing')) return false;
            if (u.id === 'explosive' && this.acquired.includes('explosive')) return false;
            if (u.id === 'bouncing' && this.acquired.includes('bouncing')) return false;
            // multiArrowは最大5本なので5つ以上なら除外
            if (u.id === 'multi_arrow') {
                const cnt = this.acquired.filter(a => a === 'multi_arrow').length;
                if (cnt >= 4) return false;
            }
            return true;
        });

        // レアリティ別に振り分け
        const epics = available.filter(u => u.rarity === 'epic');
        const rares = available.filter(u => u.rarity === 'rare');
        const commons = available.filter(u => u.rarity === 'common');

        const pool = [];
        // 少なくとも 1 つは common を含む
        pool.push(...commons);

        const r = Math.random();
        if (r < epicChance && epics.length) {
            pool.push(...epics);
        } else if (r < epicChance + rareChance && rares.length) {
            pool.push(...rares);
        }

        // pool が 3 未満の場合は残りで補充
        if (pool.length < 3) pool.push(...available);
        return pool.length ? pool : ALL_UPGRADES.slice();
    }

    /**
     * 選択されたアップグレードを記録し、適用する
     * @param {object} upgrade
     * @param {Player} player
     */
    select(upgrade, player) {
        this.acquired.push(upgrade.id);
        player.applyUpgrade(upgrade);
    }

    /**
     * HUD 表示用: 取得済みアップグレードのリスト
     */
    getAcquiredList() {
        return this.acquired.map(id => ALL_UPGRADES.find(u => u.id === id)).filter(Boolean);
    }

    /** リセット */
    reset() {
        this.acquired = [];
    }
}
