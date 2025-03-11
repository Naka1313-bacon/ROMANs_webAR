import * as THREE from 'three';
import { GLTFLoader } from 'GLTFLoader';
import { ARButton } from 'ARButton';

let camera, scene, renderer;
let reticle;
let model;
let mixer; // アニメーション用ミキサー
const clock = new THREE.Clock();

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
  // 初めからpreserveDrawingBufferをtrueにするとパフォーマンスに影響が出るので、
  // スクリーンショット時のみ一時的にtrueにします。
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // ARボタンの追加
  const arButton = ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] });
  document.body.appendChild(arButton);

  // ARセッション開始時：スクリーンショットボタン表示
  renderer.xr.addEventListener('sessionstart', () => {
    const screenshotButton = document.getElementById('screenshotButton');
    if (screenshotButton) screenshotButton.style.display = 'block';
  });
  // ARセッション終了時：スクリーンショットボタン非表示
  renderer.xr.addEventListener('sessionend', () => {
    const screenshotButton = document.getElementById('screenshotButton');
    if (screenshotButton) screenshotButton.style.display = 'none';
  });

  // スクリーンショットボタンの動作
  document.getElementById('screenshotButton').addEventListener('click', takeScreenshot);

  // 環境光
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);

  // GLTFモデルの読み込み
  const loader = new GLTFLoader();
  loader.load(
    './assets/shiroman.glb',
    (gltf) => {
      model = gltf.scene;
      model.visible = false; // AR上で配置されるまで非表示
      scene.add(model);

      // モデルのスケール調整：実寸サイズ（高さ1mにする例）
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

  // レティクルの作成（hit-test用）
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

    // アニメーションミキサー更新
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    renderer.render(scene, camera);
  });

  // ユーザーがリティクルをタッチしたときにモデルを配置する（WebXR）
  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', () => {
    // iOSの場合はQuick Lookにより処理されるのでここはWebXR用
    if (reticle.visible && model) {
      model.position.setFromMatrixPosition(reticle.matrix);
      model.visible = true;
    }
  });
  scene.add(controller);

  // ここから以下はユーザーが直感的にモデルのスケールを調整（ピンチ操作）およびドラッグ操作で移動できるようにする処理です
  setupPinchScaling();
  setupDragForModel();
  
  // Quick Lookで表示するための分岐
  // ARボタンを押した際、iOSの場合はQuick LookでUSDZファイルを起動
  arButton.addEventListener('click', async function () {
    if (isIOS()) {
      // 現在のモデルURLを元に、.glb→.usdzに変換
      if (window.currentModelURL) {
        const usdzUrl = window.currentModelURL.replace('.glb', '.usdz');
        const arLink = document.createElement('a');
        arLink.setAttribute('rel', 'ar');
        arLink.setAttribute('href', usdzUrl);
        arLink.click();
      } else {
        console.warn("現在表示中のモデルがありません。");
      }
      return;
    }
    // iOS以外の場合は通常のARセッションを開始（上記の処理がそのまま動作）
  });

  // スクリーンショットボタンの設定はそのまま
  // （screenshotButtonの処理は下記のtakeScreenshot関数で実装）
  // ※なお、ARセッション中にスクリーンショットを取る場合、preserveDrawingBufferを一時的に有効化する必要があります
  // イベントリスナーはすでに上記のコードで設定済み
}

function setupDragForModel() {
  // ユーザーがARセッション中に配置済みモデルを直感的に移動させる処理
  // ここでは、WebXRセッション中はreticleで配置されたモデル(window.arPlacedModel)がある前提です
  if (!window.arPlacedModel) return; // 配置済みモデルがなければ処理しない
  
  let isDragging = false;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragOffset = new THREE.Vector3();

  function onPointerDown(event) {
    pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
    pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(window.arPlacedModel, true);
    if (intersects.length > 0) {
      isDragging = true;
      dragOffset.copy(intersects[0].point).sub(window.arPlacedModel.position);
    }
  }
  function onPointerMove(event) {
    if (!isDragging || !window.arPlacedModel) return;
    pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
    pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -window.arPlacedModel.position.y);
    const intersection = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, intersection)) {
      window.arPlacedModel.position.copy(intersection.sub(dragOffset));
    }
  }
  function onPointerUp() {
    isDragging = false;
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);

  // セッション終了時に解除（省略可）
}

function setupPinchScaling() {
  const element = renderer.domElement;
  const pointers = {};
  let initialDistance = 0;
  let initialScale = 1;
  
  function getDistance() {
    const keys = Object.keys(pointers);
    if (keys.length < 2) return 0;
    const p1 = pointers[keys[0]];
    const p2 = pointers[keys[1]];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  function onPointerDown(event) {
    pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
    if (Object.keys(pointers).length === 2 && window.arPlacedModel) {
      initialDistance = getDistance();
      initialScale = window.arPlacedModel.scale.x;
    }
  }
  
  function onPointerMove(event) {
    if (pointers[event.pointerId]) {
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      if (Object.keys(pointers).length === 2 && window.arPlacedModel && initialDistance > 0) {
        const newDistance = getDistance();
        const scaleFactor = newDistance / initialDistance;
        const newScale = initialScale * scaleFactor;
        window.arPlacedModel.scale.set(newScale, newScale, newScale);
      }
    }
  }
  
  function onPointerUp(event) {
    delete pointers[event.pointerId];
    if (Object.keys(pointers).length < 2) {
      initialDistance = 0;
    }
  }
  
  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerUp);
  
  return function removePinchListeners() {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerUp);
  };
}

function takeScreenshot() {
  const screenshotButton = document.getElementById('screenshotButton');
  // 一旦ボタンを非表示
  screenshotButton.style.display = 'none';
  
  // ARセッション中はpreserveDrawingBufferを一時的に有効にする
  const prevPreserve = renderer.preserveDrawingBuffer;
  renderer.preserveDrawingBuffer = true;
  
  // 次のフレーム描画後にスクリーンショット取得
  setTimeout(() => {
    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'screenshot.png';
    link.click();
    
    // preserveDrawingBuffer を元に戻す
    renderer.preserveDrawingBuffer = prevPreserve;
    // ボタンを再表示
    screenshotButton.style.display = 'block';
  }, 100);
}

