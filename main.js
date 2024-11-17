import * as THREE from 'three';
import { GLTFLoader } from '/libs/GLTFLoader.js';
import { ARButton } from '/libs/ARButton.js';


let camera, scene, renderer;
let reticle; // ヒットテストの結果を示すガイド用オブジェクト
let model;

init();
function init() {
    // 基本セットアップ
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // ARボタンを追加
    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

    // GLTFモデルを読み込む
    const loader = new GLTFLoader();
    loader.load('assets/roman.glb', (gltf) => {
        model = gltf.scene;
        model.visible = false; // 配置されるまで非表示
        scene.add(model);
    });

    // ヒットテスト結果を表示するためのレティクルを追加
    const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    reticle = new THREE.Mesh(geometry, material);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // セッション開始時にヒットテストソースを設定
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
            model.visible = true;
        }
    });
}
