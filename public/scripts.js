console.log(faceapi);

const run = async () => {
  let picsTaken = 0;

  // ✅ Start webcam
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  const videoElement = document.getElementById("video-feed");
  videoElement.srcObject = stream;

  // ✅ Wait for video to load metadata (ensures width/height are valid)
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
  const galleryContainer = document.createElement('div');
  galleryContainer.id = 'photo-gallery';
  galleryContainer.style.display = 'flex';
  galleryContainer.style.flexWrap = 'wrap';
  galleryContainer.style.justifyContent = 'center';
  galleryContainer.style.marginTop = '10px';
  document.body.appendChild(galleryContainer);

  let lastCaptured = null;
  let captureTimeout = null;

  setInterval(async () => {
    // ✅ Skip if video is not ready
    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) return;

    // ✅ Detect faces + landmarks + expressions
    const detections = await faceapi
      .detectAllFaces(videoElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceExpressions();

    // ✅ Resize results safely
    const resizedDetections = faceapi.resizeResults(detections, {
      width: videoElement.videoWidth,
      height: videoElement.videoHeight
    });

    // ✅ Draw results
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    faceapi.draw.drawDetections(canvas, resizedDetections);
    faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
    faceapi.draw.drawFaceExpressions(canvas, resizedDetections);

    // ✅ Detect head direction + capture logic
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

      // ✅ Capture photo 1s after a new direction
      if (['Left', 'Right', 'Down'].includes(direction) && direction !== lastCaptured) {
        lastCaptured = direction;

        // clear existing timeout
        if (captureTimeout) clearTimeout(captureTimeout);

        if (picsTaken >= 3) return;
        captureTimeout = setTimeout(() => {
          takePhotoAndSend(videoElement, direction, galleryContainer);
          picsTaken++;
        }, 1000);
      }

      console.log('Face Direction:', direction);
    });
  }, 200);
};

// ✅ Capture photo + display locally
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

  // ✅ Example for sending to backend (optional)
  // try {
  //   const response = await fetch('https://your-api-endpoint.com/upload', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ image: dataUrl, direction: direction })
  //   });
  //   const result = await response.json();
  //   console.log('API response:', result);
  // } catch (err) {
  //   console.error('API upload error:', err);
  // }

  console.log(`Captured photo facing ${direction}`);
}

// ✅ Run the main function
run();
