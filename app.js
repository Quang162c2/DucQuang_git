(() => {
  // =========================
  // Utils
  // =========================
  const $ = (id) => document.getElementById(id);

  function logError(msg) {
    const box = $("error-log");
    box.style.display = "block";
    box.textContent += (box.textContent ? "\n" : "") + msg;
    console.error(msg);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // =========================
  // Paths (đúng cấu trúc bạn yêu cầu)
  // =========================
  const ASSETS = {
    musicUrl: "./assets/audio.mp3",
    photos: [
      "./assets/photos/image1.jpeg",
      "./assets/photos/image2.jpeg",
      "./assets/photos/image3.jpeg",
      "./assets/photos/image4.jpeg",
      "./assets/photos/image5.jpeg",
    ],
  };

  // =========================
  // Config (auto scale nhẹ theo device)
  // =========================
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  const SCALE = isMobile ? 0.65 : 1.0;

  const CONFIG = {
    goldCount: Math.floor(2200 * SCALE),
    redCount:  Math.floor(360  * SCALE),
    giftCount: Math.floor(170  * SCALE),

    explodeRadius: 68,
    photoOrbitRadius: 26,
    treeHeight: 72,
    treeBaseRadius: 36,

    // smoothness
    posLerp: 0.085,
    rotateLerp: 0.11,
    stateCooldownMs: 380,   // chống nhấp nháy state
    voteWindow: 7,          // bỏ phiếu gesture N frames
  };

  // =========================
  // Audio (optional)
  // =========================
  let bgMusic = null;
  function initAudio() {
    bgMusic = new Audio();
    bgMusic.src = ASSETS.musicUrl;
    bgMusic.loop = true;
    bgMusic.volume = 1.0;
    bgMusic.addEventListener("error", () => {
      // không có audio vẫn chạy
    });
  }

  // =========================
  // Three.js globals
  // =========================
  let scene, camera, renderer;
  let groupGold, groupRed, groupGift;
  let titleMesh, starMesh, loveMesh;
  let photoMeshes = [];
  let photoTextures = [];

  // state machine
  const STATE = { TREE:"TREE", EXPLODE:"EXPLODE", PHOTO:"PHOTO", HEART:"HEART" };
  let state = STATE.TREE;
  let desiredState = STATE.TREE;
  let lastStateSetAt = 0;

  let selectedIndex = 0;
  let handX = 0.5;

  // =========================
  // Nice textures (canvas)
  // =========================
  function createCustomTexture(type) {
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const cx = 64, cy = 64;

    if (type === "gold_glow") {
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 42);
      grd.addColorStop(0, "rgba(255,255,255,1)");
      grd.addColorStop(0.20, "rgba(255,255,224,0.95)");
      grd.addColorStop(0.55, "rgba(255,215,0,0.85)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0,0,128,128);
    }

    if (type === "red_light") {
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 55);
      grd.addColorStop(0, "rgba(255,210,210,1)");
      grd.addColorStop(0.25, "rgba(255,0,0,0.95)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0,0,128,128);
    }

    if (type === "gift_red") {
      ctx.fillStyle = "#D32F2F";
      ctx.fillRect(18, 18, 92, 92);
      ctx.fillStyle = "#FFD700";
      ctx.fillRect(56, 18, 16, 92);
      ctx.fillRect(18, 56, 92, 16);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(18, 18, 92, 92);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  const texGold = createCustomTexture("gold_glow");
  const texRed  = createCustomTexture("red_light");
  const texGift = createCustomTexture("gift_red");

  function makePlaceholderPhotoTexture(label) {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 512;
    const ctx = c.getContext("2d");

    const grd = ctx.createLinearGradient(0,0,512,512);
    grd.addColorStop(0, "#071a33");
    grd.addColorStop(1, "#2a0828");
    ctx.fillStyle = grd;
    ctx.fillRect(0,0,512,512);

    // snow
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 320; i++) {
      const x = Math.random()*512;
      const y = Math.random()*512;
      const r = Math.random()*2.5;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }

    // golden frame
    ctx.strokeStyle = "rgba(255,215,0,0.92)";
    ctx.lineWidth = 14;
    ctx.strokeRect(22,22,468,468);

    ctx.font = '900 58px "Segoe UI"';
    ctx.fillStyle = "#FFD700";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(255,0,0,0.55)";
    ctx.shadowBlur = 22;
    ctx.fillText("MERRY", 256, 230);
    ctx.fillText("CHRISTMAS", 256, 302);

    ctx.shadowBlur = 0;
    ctx.font = '900 42px "Segoe UI"';
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(label, 256, 392);

    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  function loadTextureSafe(url, fallbackLabel) {
    return new Promise((resolve) => {
      new THREE.TextureLoader().load(
        url,
        (t) => {
          t.minFilter = THREE.LinearFilter;
          t.magFilter = THREE.LinearFilter;
          resolve(t);
        },
        undefined,
        () => resolve(makePlaceholderPhotoTexture(fallbackLabel))
      );
    });
  }

  // =========================
  // Pretty shader points (mượt + glow xịn)
  // =========================
  function createPointsMaterial(mapTex, blending, opacity) {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: blending,
      uniforms: {
        uMap: { value: mapTex },
        uTime: { value: 0 },
        uOpacity: { value: opacity },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uSizeMult: { value: 1.0 },
        uBright: { value: 1.0 },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aSeed;
        attribute vec3 aColor;

        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uSizeMult;
        uniform float uBright;

        varying vec3 vColor;
        varying float vGlow;

        void main(){
          vColor = aColor;

          float pulse = 0.85 + 0.35 * sin(uTime * 10.0 + aSeed * 6.2831);
          vGlow = (pulse * uBright);

          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;

          float size = aSize * uSizeMult * pulse;
          gl_PointSize = size * uPixelRatio * (300.0 / -mv.z);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uOpacity;

        varying vec3 vColor;
        varying float vGlow;

        void main(){
          vec4 tex = texture2D(uMap, gl_PointCoord);
          float a = tex.a * uOpacity;
          if(a < 0.02) discard;

          vec3 col = tex.rgb * vColor * vGlow;

          gl_FragColor = vec4(col, a);
        }
      `,
    });

    return material;
  }

  // =========================
  // Geometry builders
  // =========================
  function buildTargets(type, count) {
    const pos = new Float32Array(count * 3);
    const tree = new Float32Array(count * 3);
    const explode = new Float32Array(count * 3);
    const heart = new Float32Array(count * 3);

    const size = new Float32Array(count);
    const seed = new Float32Array(count);
    const color = new Float32Array(count * 3);

    const baseColor = new THREE.Color();
    if (type === "gold") baseColor.setHex(0xFFFFFF);       // để tex vàng quyết định màu
    if (type === "red")  baseColor.setHex(0xFFFFFF);
    if (type === "gift") baseColor.setHex(0xFFFFFF);       // gift texture có màu sẵn

    for (let i = 0; i < count; i++) {
      // TREE
      const h = Math.random() * CONFIG.treeHeight;
      const y = h - CONFIG.treeHeight / 2;

      const radiusRatio = (type === "gold") ? Math.sqrt(Math.random()) : (0.88 + Math.random() * 0.12);
      const maxR = (1 - (h / CONFIG.treeHeight)) * CONFIG.treeBaseRadius;
      const r = maxR * radiusRatio;
      const theta = Math.random() * Math.PI * 2;

      const tx = r * Math.cos(theta);
      const tz = r * Math.sin(theta);

      tree[i*3+0] = tx;
      tree[i*3+1] = y;
      tree[i*3+2] = tz;

      // EXPLODE
      const u = Math.random();
      const v = Math.random();
      const phi = Math.acos(2 * v - 1);
      const lam = 2 * Math.PI * u;

      const radMult = (type === "gift") ? 1.18 : 1.0;
      const rad = CONFIG.explodeRadius * Math.cbrt(Math.random()) * radMult;

      explode[i*3+0] = rad * Math.sin(phi) * Math.cos(lam);
      explode[i*3+1] = rad * Math.sin(phi) * Math.sin(lam);
      explode[i*3+2] = rad * Math.cos(phi);

      // HEART (soft filled)
      const t = Math.random() * Math.PI * 2;
      let hx = 16 * Math.pow(Math.sin(t), 3);
      let hy = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);

      const fill = Math.pow(Math.random(), 0.33);
      hx *= fill; hy *= fill;
      let hz = (Math.random() - 0.5) * 10 * fill;

      const noise = 1.0;
      hx += (Math.random() - 0.5) * noise;
      hy += (Math.random() - 0.5) * noise;
      hz += (Math.random() - 0.5) * noise;

      const sH = 2.15;
      heart[i*3+0] = hx * sH;
      heart[i*3+1] = hy * sH + 6;
      heart[i*3+2] = hz;

      // INIT pos = tree
      pos[i*3+0] = tx;
      pos[i*3+1] = y;
      pos[i*3+2] = tz;

      // per-point data
      seed[i] = Math.random();
      size[i] = (type === "red") ? 3.4 : (type === "gift" ? 3.0 : 2.1);

      color[i*3+0] = baseColor.r;
      color[i*3+1] = baseColor.g;
      color[i*3+2] = baseColor.b;
    }

    return { pos, tree, explode, heart, size, seed, color };
  }

  function createParticleSystem(type, count, mapTex) {
    const data = buildTargets(type, count);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(data.pos, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(data.size, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(data.seed, 1));
    geo.setAttribute("aColor", new THREE.BufferAttribute(data.color, 3));

    geo.userData = {
      tree: data.tree,
      explode: data.explode,
      heart: data.heart,
      type: type,
    };

    const blending = (type === "gift") ? THREE.NormalBlending : THREE.AdditiveBlending;
    const opacity  = (type === "gift") ? 0.95 : 1.0;

    const mat = createPointsMaterial(mapTex, blending, opacity);
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    return pts;
  }

  // =========================
  // Photos + Decorations
  // =========================
  function createPhotos() {
    const geo = new THREE.PlaneGeometry(8, 8);

    // frame behind
    const frameGeo = new THREE.PlaneGeometry(9.3, 9.3);
    const frameMat = new THREE.MeshBasicMaterial({
      color: 0xFFD700,
      transparent: true,
      opacity: 0.88,
    });

    // glass behind
    const glassGeo = new THREE.PlaneGeometry(10.2, 10.2);
    const glassMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.18,
    });

    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: makePlaceholderPhotoTexture("Photo " + (i + 1)),
        side: THREE.DoubleSide,
        transparent: true,
      });

      const mesh = new THREE.Mesh(geo, mat);

      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.position.z = -0.25;
      mesh.add(glass);

      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.z = -0.15;
      mesh.add(frame);

      mesh.visible = false;
      mesh.scale.set(0,0,0);
      scene.add(mesh);
      photoMeshes.push(mesh);
    }
  }

  function createDecorations() {
    // Title
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 256;
    const ctx = c.getContext("2d");

    ctx.font = '900 italic 92px "Times New Roman"';
    ctx.textAlign = "center";
    ctx.fillStyle = "#FFD700";
    ctx.shadowColor = "rgba(255, 0, 0, 0.75)";
    ctx.shadowBlur = 42;
    ctx.fillText("MERRY CHRISTMAS", 512, 132);

    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending });
    titleMesh = new THREE.Mesh(new THREE.PlaneGeometry(64, 16), mat);
    titleMesh.position.set(0, 52, 0);
    scene.add(titleMesh);

    // Star
    const s = document.createElement("canvas");
    s.width = 128; s.height = 128;
    const sCtx = s.getContext("2d");

    sCtx.fillStyle = "#ffff66";
    sCtx.shadowColor = "rgba(255,255,255,0.95)";
    sCtx.shadowBlur = 26;
    sCtx.beginPath();
    const cx=64, cy=64, outer=50, inner=21;
    for (let i=0;i<5;i++){
      sCtx.lineTo(cx + Math.cos((18+i*72)/180*Math.PI)*outer, cy - Math.sin((18+i*72)/180*Math.PI)*outer);
      sCtx.lineTo(cx + Math.cos((54+i*72)/180*Math.PI)*inner, cy - Math.sin((54+i*72)/180*Math.PI)*inner);
    }
    sCtx.closePath(); sCtx.fill();

    const sTex = new THREE.CanvasTexture(s);
    const sMat = new THREE.MeshBasicMaterial({ map:sTex, transparent:true, blending:THREE.AdditiveBlending });
    starMesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), sMat);
    starMesh.position.set(0, CONFIG.treeHeight/2 + 3, 0);
    scene.add(starMesh);

    // Love text
    const l = document.createElement("canvas");
    l.width = 1024; l.height = 256;
    const lCtx = l.getContext("2d");

    lCtx.font = '900 120px "Segoe UI", sans-serif';
    lCtx.textAlign = "center";
    lCtx.fillStyle = "#ff69b4";
    lCtx.shadowColor = "rgba(255, 20, 147, 0.9)";
    lCtx.shadowBlur = 40;
    lCtx.fillText("I LOVE YOU ❤️", 512, 138);

    const lTex = new THREE.CanvasTexture(l);
    const lMat = new THREE.MeshBasicMaterial({ map:lTex, transparent:true, blending:THREE.AdditiveBlending });
    loveMesh = new THREE.Mesh(new THREE.PlaneGeometry(74, 18), lMat);
    loveMesh.position.set(0, 2, 24);
    loveMesh.visible = false;
    scene.add(loveMesh);
  }

  // =========================
  // Background starfield (thêm “wow” nhẹ)
  // =========================
  function createStarfield() {
    const count = Math.floor(900 * SCALE);
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const seed = new Float32Array(count);
    const color = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const r = 420 * Math.cbrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2*Math.random() - 1);

      pos[i*3+0] = r * Math.sin(b) * Math.cos(a);
      pos[i*3+1] = r * Math.sin(b) * Math.sin(a);
      pos[i*3+2] = r * Math.cos(b);

      size[i] = 1.2 + Math.random() * 1.6;
      seed[i] = Math.random();

      // hơi xanh tím cho “space vibe”
      color[i*3+0] = 0.95;
      color[i*3+1] = 0.95;
      color[i*3+2] = 1.00;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geo.setAttribute("aColor", new THREE.BufferAttribute(color, 3));

    const starTex = createCustomTexture("gold_glow");
    const mat = createPointsMaterial(starTex, THREE.AdditiveBlending, 0.35);
    mat.uniforms.uSizeMult.value = 0.65;
    mat.uniforms.uBright.value = 0.55;

    const pts = new THREE.Points(geo, mat);
    pts.position.z = -120;
    scene.add(pts);

    return pts;
  }

  // =========================
  // Three init
  // =========================
  let starfield = null;

  function init3D() {
    const container = $("canvas-container");

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.0018);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1200);
    camera.position.z = 105;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // cinematic
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.20;

    container.appendChild(renderer.domElement);

    // systems
    starfield = createStarfield();

    groupGold = createParticleSystem("gold", CONFIG.goldCount, texGold);
    groupRed  = createParticleSystem("red",  CONFIG.redCount,  texRed);
    groupGift = createParticleSystem("gift", CONFIG.giftCount, texGift);

    createPhotos();
    createDecorations();
    animate();
  }

  // =========================
  // Smooth state update (anti flicker)
  // =========================
  function setDesiredState(next) {
    desiredState = next;
    const now = performance.now();
    if (now - lastStateSetAt < CONFIG.stateCooldownMs) return;
    if (state !== desiredState) {
      state = desiredState;
      lastStateSetAt = now;
    }
  }

  // =========================
  // Update particle groups
  // =========================
  function updateGroup(group, time, handRotY) {
    const geo = group.geometry;
    const pos = geo.attributes.position.array;

    const type = geo.userData.type;

    // choose target array
    let targets = geo.userData.tree;
    if (state === STATE.EXPLODE || state === STATE.PHOTO) targets = geo.userData.explode;
    if (state === STATE.HEART) targets = geo.userData.heart;

    // position lerp
    const t = CONFIG.posLerp;
    for (let i = 0; i < pos.length; i++) {
      pos[i] += (targets[i] - pos[i]) * t;
    }
    geo.attributes.position.needsUpdate = true;

    // material time
    group.material.uniforms.uTime.value = time;

    // style per state
    if (state === STATE.TREE) {
      group.rotation.y += 0.0035;
      group.material.uniforms.uSizeMult.value = (type === "red") ? 1.06 : 1.00;
      group.material.uniforms.uBright.value = (type === "gold") ? 1.10 : 1.00;
      group.scale.set(1,1,1);
    }

    if (state === STATE.EXPLODE) {
      group.rotation.y += (handRotY - group.rotation.y) * CONFIG.rotateLerp;
      group.material.uniforms.uSizeMult.value = 1.05;
      group.material.uniforms.uBright.value = 1.10;
      group.scale.set(1,1,1);
    }

    if (state === STATE.PHOTO) {
      // keep explode swarm behind photo
      group.rotation.y += (handRotY - group.rotation.y) * (CONFIG.rotateLerp * 0.6);
      group.material.uniforms.uSizeMult.value = 0.95;
      group.material.uniforms.uBright.value = 0.95;
      group.scale.set(1,1,1);
    }

    if (state === STATE.HEART) {
      group.rotation.y = 0;
      const beat = 1 + Math.abs(Math.sin(time * 3.0)) * 0.16;
      group.scale.set(beat, beat, beat);

      // làm “lọc bớt” quà cho trái tim nhìn clean
      group.material.uniforms.uSizeMult.value = (type === "gift") ? 0.75 : 1.00;
      group.material.uniforms.uBright.value = (type === "red") ? 1.05 : 0.95;
    }
  }

  // =========================
  // Main animation
  // =========================
  const tmpV3 = new THREE.Vector3();

  function animate() {
    requestAnimationFrame(animate);
    const time = performance.now() * 0.001;

    // starfield
    if (starfield) {
      starfield.material.uniforms.uTime.value = time * 0.55;
      starfield.rotation.y += 0.0006;
    }

    const handRotY = (handX - 0.5) * 4.0;

    updateGroup(groupGold, time, handRotY);
    updateGroup(groupRed,  time, handRotY);
    updateGroup(groupGift, time, handRotY);

    // UI text / meshes
    if (state === STATE.TREE) {
      titleMesh.visible = true;
      starMesh.visible = true;
      loveMesh.visible = false;

      titleMesh.scale.lerp(tmpV3.set(1,1,1), 0.12);
      starMesh.rotation.z -= 0.022;
      starMesh.material.opacity = 0.68 + 0.32 * Math.sin(time * 4.7);

      photoMeshes.forEach(m => {
        m.visible = false;
        m.scale.lerp(tmpV3.set(0,0,0), 0.12);
      });
    }

    if (state === STATE.HEART) {
      titleMesh.visible = false;
      starMesh.visible = false;
      loveMesh.visible = true;

      const s = 1 + Math.abs(Math.sin(time*3.0)) * 0.12;
      loveMesh.scale.set(s, s, 1);

      photoMeshes.forEach(m => { m.visible = false; });
    }

    if (state === STATE.EXPLODE) {
      titleMesh.visible = false;
      starMesh.visible = false;
      loveMesh.visible = false;

      const baseAngle = groupGold.rotation.y;
      const step = (Math.PI * 2) / 5;

      let best = 0;
      let maxZ = -999;

      photoMeshes.forEach((mesh, i) => {
        mesh.visible = true;

        const angle = baseAngle + i * step;
        const x = Math.sin(angle) * CONFIG.photoOrbitRadius;
        const z = Math.cos(angle) * CONFIG.photoOrbitRadius;
        const y = Math.sin(time + i) * 3.2;

        mesh.position.lerp(tmpV3.set(x, y, z), 0.11);
        mesh.lookAt(camera.position);

        if (z > maxZ) { maxZ = z; best = i; }

        if (z > 5) {
          const ds = 1.0 + (z/CONFIG.photoOrbitRadius) * 0.85;
          mesh.scale.lerp(tmpV3.set(ds, ds, ds), 0.10);
        } else {
          mesh.scale.lerp(tmpV3.set(0.62, 0.62, 0.62), 0.10);
        }
      });

      selectedIndex = best;
    }

    if (state === STATE.PHOTO) {
      titleMesh.visible = false;
      starMesh.visible = false;
      loveMesh.visible = false;

      photoMeshes.forEach((mesh, i) => {
        if (i === selectedIndex) {
          mesh.visible = true;
          mesh.position.lerp(tmpV3.set(0, 0, 62), 0.12);
          mesh.scale.lerp(tmpV3.set(5.2, 5.2, 5.2), 0.12);
          mesh.lookAt(camera.position);
          mesh.rotation.z = 0;
        } else {
          mesh.visible = false;
          mesh.scale.lerp(tmpV3.set(0,0,0), 0.14);
        }
      });
    }

    renderer.render(scene, camera);
  }

  // =========================
  // Load photo textures async
  // =========================
  async function preloadPhotos() {
    const texList = [];
    for (let i = 0; i < ASSETS.photos.length; i++) {
      texList.push(await loadTextureSafe(ASSETS.photos[i], "Photo " + (i + 1)));
    }
    photoTextures = texList;

    for (let i = 0; i < photoMeshes.length; i++) {
      photoMeshes[i].material.map = photoTextures[i] || makePlaceholderPhotoTexture("Photo " + (i + 1));
      photoMeshes[i].material.needsUpdate = true;
    }
  }

  // =========================
  // MediaPipe hands (ổn định, không crash)
  // =========================
  let gestureVotes = [];
  function voteGesture(g) {
    gestureVotes.push(g);
    if (gestureVotes.length > CONFIG.voteWindow) gestureVotes.shift();

    const freq = new Map();
    for (const x of gestureVotes) freq.set(x, (freq.get(x) || 0) + 1);

    let best = STATE.TREE;
    let max = -1;
    for (const [k, v] of freq.entries()) {
      if (v > max) { max = v; best = k; }
    }
    return best;
  }

  function classifyGesture(results) {
    const lms = results.multiHandLandmarks;
    if (!lms || lms.length === 0) return STATE.TREE;

    // Heart: 2 hands close (index tip + thumb tip)
    if (lms.length >= 2) {
      const h1 = lms[0], h2 = lms[1];
      const distIndex = Math.hypot(h1[8].x - h2[8].x, h1[8].y - h2[8].y);
      const distThumb = Math.hypot(h1[4].x - h2[4].x, h1[4].y - h2[4].y);
      if (distIndex < 0.15 && distThumb < 0.15) return STATE.HEART;
    }

    // Single hand
    const lm = lms[0];
    handX = lm[9].x;

    const tips = [8, 12, 16, 20];
    const wrist = lm[0];
    let openDist = 0;
    for (const i of tips) openDist += Math.hypot(lm[i].x - wrist.x, lm[i].y - wrist.y);
    const avgDist = openDist / 4;

    const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);

    if (avgDist < 0.25) return STATE.TREE;      // fist-ish
    if (pinchDist < 0.05) return STATE.PHOTO;   // pinch
    return STATE.EXPLODE;                       // open
  }

  async function initHands() {
    const video = document.getElementsByClassName("input_video")[0];
    const canvas = $("camera-preview");
    const ctx = canvas.getContext("2d");
    const status = $("status");

    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    let frameCnt = 0;

    hands.onResults((results) => {
      try {
        // preview
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (results.image) ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

        const raw = classifyGesture(results);
        const stable = voteGesture(raw);
        setDesiredState(stable);

        // status label
        if (state === STATE.TREE)   status.textContent = "Tree Mode";
        if (state === STATE.EXPLODE)status.textContent = "Explode Mode";
        if (state === STATE.PHOTO)  status.textContent = "Photo Mode";
        if (state === STATE.HEART)  status.textContent = "Love Mode";
      } catch (e) {
        logError("hands.onResults crash: " + (e?.message || e));
      }
    });

    const cam = new Camera(video, {
      onFrame: async () => {
        frameCnt++;
        if (frameCnt % 2 !== 0) return; // nhẹ CPU, vẫn mượt
        await hands.send({ image: video });
      },
      width: 320,
      height: 240,
    });

    try {
      await cam.start();
    } catch (e) {
      logError("Không bật được camera (hãy chạy bằng localhost/https + cho phép quyền). Fallback: phím 1-4.");
      setDesiredState(STATE.EXPLODE);
    }
  }

  // =========================
  // Controls + Resize
  // =========================
  function initControls() {
    window.addEventListener("keydown", (e) => {
      if (e.key === "1") setDesiredState(STATE.TREE);
      if (e.key === "2") setDesiredState(STATE.EXPLODE);
      if (e.key === "3") setDesiredState(STATE.PHOTO);
      if (e.key === "4") setDesiredState(STATE.HEART);
    });

    window.addEventListener("resize", () => {
      if (!camera || !renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);

      // update pixel ratio uniform
      const pr = Math.min(window.devicePixelRatio, 2);
      [groupGold, groupRed, groupGift, starfield].forEach(g => {
        if (g && g.material && g.material.uniforms && g.material.uniforms.uPixelRatio) {
          g.material.uniforms.uPixelRatio.value = pr;
        }
      });
    });
  }

  // =========================
  // Start System
  // =========================
  async function startSystem() {
    $("btnStart").style.display = "none";

    initAudio();
    try { await bgMusic.play(); } catch (_) {}

    init3D();
    initControls();

    // textures load
    preloadPhotos().catch((e) => logError("preloadPhotos: " + (e?.message || e)));

    // hands
    initHands().catch((e) => logError("initHands: " + (e?.message || e)));
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("btnStart").addEventListener("click", startSystem);
    $("status").textContent = "Ready";
  });
})();
