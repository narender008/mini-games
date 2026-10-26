// Pools of instanced effects (paint droplets and their splats, petals,
// bubbles, puddles, glints, pond rings) keep every slot in the draw and hide
// the idle ones by scaling them to nothing. Hidden slots still cost their
// vertices every frame: 320 droplets of 280 triangles are 90k triangles drawn
// for nothing on a quiet screen. Before each frame this draws only up to the
// last slot in use, and none at all when the pool is idle. The picture is the
// same: only slots that were scaled to nothing are left out.
//
// Only for meshes whose own code never sets `count` after it is made.
export class InstanceTrim {
  constructor() {
    this.list = [];
  }

  add(...meshes) {
    for (const m of meshes) {
      if (!m || !m.isInstancedMesh || this.list.includes(m)) continue;
      m.userData.trimCap = m.instanceMatrix.count;
      this.list.push(m);
    }
  }

  update() {
    for (const m of this.list) {
      const a = m.instanceMatrix.array;
      let n = m.userData.trimCap;
      // the last slot whose matrix is not all zero in its 3x3 part
      while (n > 0) {
        const o = (n - 1) * 16;
        if (a[o] || a[o + 1] || a[o + 2] || a[o + 4] || a[o + 5] || a[o + 6] || a[o + 8] || a[o + 9] || a[o + 10]) break;
        n--;
      }
      m.count = n;
      // (an idle pool is not drawn at all; a pool's own code never hides these meshes)
      m.visible = n > 0;
    }
  }

  // everything drawn again (for a warm-up pass that must compile and upload all of them)
  showAll(on) {
    for (const m of this.list) {
      m.count = m.userData.trimCap;
      m.visible = on;
    }
  }
}
