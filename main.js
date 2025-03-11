// iOS判定用関数
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// 自前のAR開始ボタンを作成
const arButton = document.createElement('button');
arButton.textContent = 'AR モード';
arButton.style.position = 'fixed';
arButton.style.bottom = '20px';
arButton.style.right = '20px';
arButton.style.padding = '12px 20px';
arButton.style.fontSize = '16px';
arButton.style.background = '#4CAF50';
arButton.style.color = '#fff';
arButton.style.border = 'none';
arButton.style.borderRadius = '4px';
arButton.style.cursor = 'pointer';
document.body.appendChild(arButton);

arButton.addEventListener('click', async () => {
  if (isIOS()) {
    // iOSの場合: Quick LookでUSDZファイルを表示
    // ここでは、グローバル変数 window.currentModelURL に読み込んだGLBのURLが保存されていると仮定します
    if (window.currentModelURL) {
      const usdzUrl = window.currentModelURL.replace('.glb', '.usdz');
      const a = document.createElement('a');
      a.setAttribute('rel', 'ar');
      a.setAttribute('href', usdzUrl);
      a.click();
    } else {
      console.warn("現在表示中のモデルがありません。");
    }
  } else {
  // iOS 以外の場合：WebXR を利用した AR セッションの開始
  if (navigator.xr) {
    const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
    if (isSupported) {
      try {
        // AR セッション開始時に不要な UI を非表示
        hideUIElements();

        const session = await navigator.xr.requestSession('immersive-ar', {
          optionalFeatures: ['dom-overlay', 'local-floor', 'hit-test'],
          domOverlay: { root: document.body }
        });
        window.renderer.xr.enabled = true;
        window.renderer.xr.setSession(session);

        // セッション終了時に UI 要素を再表示し、元のアニメーションループに戻す
        session.addEventListener('end', () => {
          showUIElements();
          if (typeof animate === 'function') {
            window.renderer.setAnimationLoop(animate);
          }
        });

        // 平面検知およびリティクル、タップでのモデル配置をセットアップ
        setupHitTest(session);
      } catch (e) {
        console.error("AR セッション開始に失敗しました:", e);
      }
    } else {
      console.log("immersive-ar セッションはこのデバイスではサポートされていません。");
    }
  } else {
    console.log("WebXR が利用できません。このデバイスでは AR モードは利用できません。");
  }
  }
});
