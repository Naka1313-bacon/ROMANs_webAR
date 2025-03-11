import * as THREE from 'three';
import { GLTFLoader } from 'GLTFLoader';
import { ARButton } from 'ARButton';

let camera, scene, renderer;
let reticle;
let model;
let mixer; // アニメーション再生用ミキサー
const clock = new THREE.Clock();

// iOS判定関数
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

init();
function init() {
  // シーンの作成
  scene = new THREE.Scene();

  // カメラの作成
  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    20
  );

  // レンダラーの作成
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // ARボタンの生成（iOSの場合はQuick Look用ボタンを作成）
  let arButton;
  if (isIOS()) {
    arButton = document.createElement('button');
    arButton.style.position = 'absolute';
    arButton.style.bottom = '20px';
    arButton.style.left = '50%';
    arButton.style.transform = 'translateX(-50%)';
    arButton.style.padding = '12px 24px';
    arButton.style.fontSize = '18px';
    arButton.style.backgroundColor = '#4CAF50';
    arButton.style.color = '#fff';
    arButton.style.border = 'none';
    arButton.style.borderRadius = '4px';
    arButton.style.cursor = 'pointer';
    arButton.textContent = 'AR Quick Look';
    // Quick Look用イベントリスナー
    arButton.addEventListener('click', () => {
      // ここでは、読み込んでいるglbと同名のUSDZファイルを使用する前提
      // 例：'./assets/shiroman.glb' -> './assets/shiroman.usdz'
      const usdzUrl = './assets/shiroman.usdz';
      const arLink = document.createElement('a');
      arLink.setAttribute('rel', 'ar');
      arLink.setAttribute('href', usdzUrl);
      arLink.click();
    });
  } else {
    // iOS以外の場合は従来のARButtonを利用
    arButton = ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] });
  }
  document.body.appendChild(arButton);

  // ARセッション開始時、スクリーンショットボタン表示
  renderer.xr.addEventListener('sessionstart', () => {
    const screenshotButton = document.getElementById('screenshotButton');
    if (screenshotButton) screenshotButton.style.display = 'block';
  });

  // ARセッション終了時、スクリーンショットボタン非表示
  renderer.xr.addEventListener('sessionend', () => {
    const screenshotButton = document.getElementById('screenshotButton');
    if (screenshotButton) screenshotButton.style.display = 'none';
  });

  // スクリーンショットボタンの動作
  document.getElementById('screenshotButton').addEventListener('click', takeScreenshot);

  // 環境光の追加
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);

  // GLTFモデルの読み込み
  const loader = new GLTFLoader();
  loader.load(
    './assets/shiroman.glb',
    (gltf) => {
      model = gltf.scene;
      model.visible = false; // 配置されるまで非表示
      scene.add(model);

      // モデルのスケール調整（高さを1メートルに設定）
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const originalHeight = size.y;
      const desiredHeight = 1; // 1メートル
      const scaleRatio = desiredHeight / originalHeight;
      model.scale.set(scaleRatio, scaleRatio, scaleRatio);

      // アニメーションが含まれている場合、AnimationMixer を設定
      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => {
          mixer.clipAction(clip).play();
        });
      }
      console.log('model loaded');
    },
    undefined,
    (error) => {
      console.error(error);
    }
  );

  // レティクルの作成
  const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  reticle = new THREE.Mesh(geometry, material);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // ヒットテストソースの設定
  let hitTestSource = null;
  let hitTestSourceRequested = false;

  renderer.setAnimationLoop((timestamp, frame) => {
    if (frame) {
      const referenceSpace = renderer.xr.getReferenceSpace();
      const session = renderer.xr.getSession();

      if (!hitTestSourceRequested) {
        session.requestReferenceSpace('viewer').then((space) => {
          session.requestHitTestSource({ space }).then((source) => {
            hitTestSource = source;
          });
        });
        session.addEventListener('end', () => {
          hitTestSourceRequested = false;
          hitTestSource = null;
        });
        hitTestSourceRequested = true;
      }

      if (hitTestSource) {
        const hitTestResults = frame.getHitTestResults(hitTestSource);
        if (hitTestResults.length > 0) {
          const hit = hitTestResults[0];
          const pose = hit.getPose(referenceSpace);
          reticle.visible = true;
          reticle.matrix.fromArray(pose.transform.matrix);
        } else {
          reticle.visible = false;
        }
      }
    }

    // アニメーションミキサーの更新
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    renderer.render(scene, camera);
  });

  // レティクルをタップしたときにモデルを配置
  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', () => {
    if (reticle.visible && model) {
      model.position.setFromMatrixPosition(reticle.matrix);
      model.visible = true;
    }
  });
  scene.add(controller);
}

function takeScreenshot() {
  const screenshotButton = document.getElementById('screenshotButton');
  screenshotButton.style.display = 'none';

  setTimeout(() => {
    renderer.preserveDrawingBuffer = true;
    const dataURL = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'screenshot.png';
    link.click();
    renderer.preserveDrawingBuffer = false;
    screenshotButton.style.display = 'block';
  }, 100);
}

