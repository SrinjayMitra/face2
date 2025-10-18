console.log(faceapi);

const run = async () => {
  let picsTaken = 0;

  // ✅ Start webcam
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  const videoElement = document.getElementById("video-feed");
  videoElement.srcObject = stream;

  // ✅ Wait for video to load metadata
  await new Promise(resolve => {
    videoElement.onloadedmetadata = () => {
      videoElement.play();
      resolve();
    };
  });

  // ✅ Load Face API models
  await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
  await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
  await faceapi.nets.faceExpressionNet.loadFromUri('/models');
  console.log("Models Loaded");

  const canvas = document.getElementById('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  const ctx = canvas.getContext('2d');

  // ✅ Create gallery container
  let galleryContainer = document.getElementById('gallery-images');
  if (!galleryContainer) {
    const galleryWrapper = document.createElement('div');
    galleryWrapper.id = 'gallery';
    galleryWrapper.style.width = '100%';
    galleryWrapper.style.display = 'flex';
    galleryWrapper.style.flexDirection = 'column';
    galleryWrapper.style.alignItems = 'center';
    galleryWrapper.style.marginTop = '5px';
    const h2 = document.createElement('h2');
    h2.innerText = 'Captured Faces';
    h2.style.color = '#ffcc00';
    h2.style.margin = '5px 0';
    galleryWrapper.appendChild(h2);
    galleryContainer = document.createElement('div');
    galleryContainer.id = 'gallery-images';
    galleryContainer.style.display = 'flex';
    galleryContainer.style.flexWrap = 'wrap';
    galleryContainer.style.justifyContent = 'center';
    galleryContainer.style.gap = '5px';
    galleryWrapper.appendChild(galleryContainer);
    document.body.appendChild(galleryWrapper);
  }

  // ✅ Create direction overlay
  let directionText = document.getElementById('direction-text');
  if (!directionText) {
    directionText = document.createElement('div');
    directionText.id = 'direction-text';
    directionText.style.position = 'absolute';
    directionText.style.top = '8%';
    directionText.style.width = '100%';
    directionText.style.textAlign = 'center';
    directionText.style.fontSize = '1.6rem';
    directionText.style.color = '#ffcc00';
    directionText.style.fontWeight = 'bold';
    directionText.style.textShadow = '0 0 8px rgba(255,204,0,0.8)';
    directionText.style.zIndex = '5';
    updateDirectionOverlay(direction);
    document.getElementById('video-section').appendChild(directionText);
  }

  let lastCaptured = null;
  let captureTimeout = null;

  setInterval(async () => {
    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) return;

    // ✅ Detect faces + landmarks + expressions
    const detections = await faceapi
      .detectAllFaces(videoElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceExpressions();

    const resizedDetections = faceapi.resizeResults(detections, {
      width: videoElement.videoWidth,
      height: videoElement.videoHeight
    });

    // ✅ Draw results
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    faceapi.draw.drawDetections(canvas, resizedDetections);
    faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
    faceapi.draw.drawFaceExpressions(canvas, resizedDetections);

    // ✅ Detect head direction + update overlay
    resizedDetections.forEach(face => {
      const { landmarks, detection } = face;
      if (!landmarks) return;

      const nose = landmarks.getNose();
      const leftEye = landmarks.getLeftEye();
      const rightEye = landmarks.getRightEye();

      const noseX = nose[3].x;
      const noseY = nose[3].y;
      const leftEyeX = leftEye[0].x;
      const rightEyeX = rightEye[3].x;
      const leftEyeY = leftEye[0].y;
      const rightEyeY = rightEye[3].y;

      const leftDist = Math.abs(noseX - leftEyeX);
      const rightDist = Math.abs(rightEyeX - noseX);
      const eyeAvgY = (leftEyeY + rightEyeY) / 2;
      const verticalDiff = noseY - eyeAvgY;

      let direction = 'Center';
      if (leftDist > rightDist * 1.2) direction = 'Left';
      else if (rightDist > leftDist * 1.2) direction = 'Right';
      else if (verticalDiff > 15) direction = 'Down';
      else if (verticalDiff < -15) direction = 'Up';

      new faceapi.draw.DrawTextField([direction], detection.box.bottomLeft).draw(canvas);

      // ✅ Update direction overlay
      directionText.innerText = `Look ${direction}`;

      // ✅ Capture photo
      if (['Left', 'Right', 'Down'].includes(direction) && direction !== lastCaptured) {
        lastCaptured = direction;
        if (captureTimeout) clearTimeout(captureTimeout);

        if (picsTaken >= 3) return;
        captureTimeout = setTimeout(() => {
          takePhotoAndSend(videoElement, direction, galleryContainer);
          picsTaken++;
        }, 1000);
      }
    });
  }, 200);
};

// ✅ Capture photo + display
async function takePhotoAndSend(video, direction, galleryContainer) {
  const photoCanvas = document.createElement('canvas');
  photoCanvas.width = video.videoWidth;
  photoCanvas.height = video.videoHeight;

  const ctx = photoCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

  const dataUrl = photoCanvas.toDataURL('image/png');

  // ✅ Display in gallery
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = `Photo facing ${direction}`;
  img.style.width = '100px';
  img.style.height = 'auto';
  img.style.margin = '5px';
  img.style.borderRadius = '10px';
  img.style.boxShadow = '0 0 5px rgba(0,0,0,0.5)';
  galleryContainer.appendChild(img);

  console.log(`Captured photo facing ${direction}`);
}


// Auto-cycle direction overlay for guidance
const autoCycleDirections = ['Left', 'Right', 'Center'];
let autoCycleIndex = 0;

setInterval(() => {
  const direction = autoCycleDirections[autoCycleIndex];
  updateDirectionOverlay(direction);
  autoCycleIndex = (autoCycleIndex + 1) % autoCycleDirections.length;
}, 2500); // change every 2.5 seconds


// ✅ Run main function
run();
