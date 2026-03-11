// ============================================================
// world.js — 手続き生成チャンクワールド (オートランナー用)
// プレイヤーが前進するにつれて前方にチャンクを生成し
// 後方の古いチャンクを削除する
// ============================================================
import * as THREE from 'three';

const CHUNK_LENGTH = 40;   // チャンク1つ当たりの奥行き (Z方向)
const CHUNK_WIDTH = 30;   // チャンクの幅
const VISIBLE_AHEAD = 4;    // 前方に維持するチャンク数
const VISIBLE_BEHIND = 2;    // 後方に残すチャンク数

export class World {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.chunks = [];       // 生成済みチャンクリスト
    this._nextChunkZ = 0;     // 次に生成するチャンクのZ座標 (負方向へ)

    this._createLighting();
    this._createFog();

    // 初期チャンクを生成
    for (let i = 0; i < VISIBLE_AHEAD + VISIBLE_BEHIND + 1; i++) {
      this._spawnChunk();
    }
  }

  // ---------- チャンク生成 ----------
  _spawnChunk() {
    const chunkZ = this._nextChunkZ;
    this._nextChunkZ -= CHUNK_LENGTH;

    const group = new THREE.Group();

    // 地面プレート
    const groundGeo = new THREE.PlaneGeometry(CHUNK_WIDTH, CHUNK_LENGTH, 10, 10);
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, pos.getZ(i) + (Math.random() - 0.5) * 0.25);
    }
    groundGeo.computeVertexNormals();

    // 頂点カラー (緑のバリエーション)
    const colors = [];
    const c1 = new THREE.Color(0x388e3c);
    const c2 = new THREE.Color(0x66bb6a);
    for (let i = 0; i < pos.count; i++) {
      const t = Math.random();
      const c = c1.clone().lerp(c2, t);
      colors.push(c.r, c.g, c.b);
    }
    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    // チャンクの中心Z位置
    ground.position.set(0, 0, chunkZ - CHUNK_LENGTH / 2);
    group.add(ground);

    // サイドの装飾 (左右に木・岩を置く、中央は走路として空ける)
    this._addSideDecorations(group, chunkZ);

    group.userData.chunkZ = chunkZ;
    this.scene.add(group);
    this.chunks.push(group);
  }

  // ---------- 左右の装飾オブジェクト ----------
  _addSideDecorations(group, chunkZ) {
    const sides = [-1, 1];
    const treeGeo = [
      new THREE.ConeGeometry(1.2, 2.5, 7),
      new THREE.ConeGeometry(0.9, 2.0, 6),
    ];
    const treeMats = [
      new THREE.MeshLambertMaterial({ color: 0x2e7d32 }),
      new THREE.MeshLambertMaterial({ color: 0x388e3c }),
    ];
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x795548 });
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x78909c });

    for (const side of sides) {
      const baseX = side * (CHUNK_WIDTH / 2 + 2);
      const count = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const rnd = Math.random();
        const z = chunkZ - Math.random() * CHUNK_LENGTH;
        const x = baseX + side * Math.random() * 6;

        if (rnd < 0.65) {
          // 木
          const scale = 0.6 + Math.random() * 0.8;
          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.28, 1.6 * scale, 6), trunkMat,
          );
          trunk.position.set(x, 0.8 * scale, z);
          const leaf = new THREE.Mesh(
            treeGeo[Math.floor(Math.random() * treeGeo.length)],
            treeMats[Math.floor(Math.random() * treeMats.length)],
          );
          leaf.position.set(x, 2.0 * scale + 0.8 * scale - 0.4, z);
          group.add(trunk, leaf);
        } else {
          // 岩
          const s = 0.4 + Math.random() * 0.7;
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
          rock.position.set(x, s * 0.5, z);
          rock.rotation.set(Math.random(), Math.random(), Math.random());
          group.add(rock);
        }
      }
    }
  }

  // ---------- ライティング ----------
  _createLighting() {
    const ambient = new THREE.AmbientLight(0xfff4e0, 0.8);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfffde7, 1.1);
    sun.position.set(10, 30, 10);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xd0eaff, 0.3);
    fill.position.set(-10, 8, -10);
    this.scene.add(fill);
  }

  // ---------- フォグ ----------
  _createFog() {
    this.scene.fog = new THREE.Fog(0x87ceeb, 40, 100);
    this.scene.background = new THREE.Color(0x87ceeb);
  }

  // ---------- 毎フレーム: チャンクのスクロール管理 ----------
  /**
   * @param {number} playerZ — プレイヤーの現在Z座標
   */
  update(playerZ) {
    // 前方に新チャンクが必要か
    const frontEdge = playerZ - VISIBLE_AHEAD * CHUNK_LENGTH;
    if (this._nextChunkZ > frontEdge) {
      this._spawnChunk();
    }

    // 後方の古いチャンクを削除
    const backEdge = playerZ + VISIBLE_BEHIND * CHUNK_LENGTH;
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      if (this.chunks[i].userData.chunkZ > backEdge) {
        this.scene.remove(this.chunks[i]);
        this.chunks.splice(i, 1);
      }
    }
  }
}
