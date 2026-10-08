# 隨網站分發的工具與模型

- MediaPipe Tasks Vision 1.1.0：Google，Apache-2.0。JavaScript 與 WASM 從官方 npm 套件複製；[上游](https://github.com/google-ai-edge/mediapipe)。
- BlazeFace short range（float16）、EfficientDet Lite0（float32）：Google MediaPipe 官方模型倉庫。來源 URL、檔案大小及 SHA256 保留於 `public/workspace/vendor/mediapipe/models/manifest.json`；[Face Detector](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector)、[Object Detector](https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector)。
- ZXing JS 0.21.3：Apache-2.0，隨網站提供已打包讀取器；[上游](https://github.com/zxing-js/library)。
- Wonderland Engine 1.6.1：使用本機已安裝 Editor 匯出的 runtime，授權依 Wonderland Engine 條款；不是自製畫布模擬。[官方網站](https://wonderlandengine.com/)。

MediaPipe／ZXing 原有版權註記保留在發佈資產中。Apache-2.0 完整授權文字置於 `/workspace/vendor/APACHE-2.0.txt`。

- ONNX Runtime Web 1.20.1：Microsoft，MIT。本站提供單執行緒 WASM 推論；授權與第三方通知置於 `/workspace/vendor/ort/`。[官方](https://github.com/microsoft/onnxruntime)。
- torchvision MobileNetV3-small：BSD-3-Clause 軟體、ImageNet1K_V1 預訓練骨幹；本地訓練分類頭和末端區塊，保留 torchvision 署名。
- Package Defect Detection Benchmark：ivannuke，[資料來源](https://www.kaggle.com/datasets/ivannuke/defective-box-detection-real-vs-synthetic)，CC BY-SA 4.0。訓練資料與訓練衍生模型保留相同授權及署名，僅模型與報告部署。原始照片留在本機。模型尚未通過實際驗收，見 `/workspace/model-report.html`。
