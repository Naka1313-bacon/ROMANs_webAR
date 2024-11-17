import * as THREE from 'three';
import { GLTFLoader } from 'GLTFLoader';
import { ARButton } from 'ARButton';


let camera, scene, renderer;
let reticle; // ヒットテストの結果を示すガイド用オブジェクト
let model;

init();
function init() {
    // シーンの作成
    scene = new THREE.Scene();

    // カメラの作成
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    // レンダラーの作成
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // ARボタンの追加
    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

    // 環境光の追加
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // GLTFモデルの読み込み
    const loader = new GLTFLoader();
    loader.load('./assets/roman.glb', (gltf) => {
        model = gltf.scene;
        model.visible = false; // 配置されるまで非表示
        scene.add(model);
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const originalHeight = size.y;
    const desiredHeight = 1; // メートル単位
    const scaleRatio = desiredHeight / originalHeight;
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

        renderer.render(scene, camera);
    });

    // レティクルをタップしたときにモデルを配置
    window.addEventListener('click', () => {
        if (reticle.visible && model) {
            model.position.setFromMatrixPosition(reticle.matrix);
            model.scale.set(scaleRatio, scaleRatio, scaleRatio);
            model.visible = true;
        }
    });
}
