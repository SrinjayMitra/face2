console.log(faceapi);

const directions = ['Left', 'Right', 'Center'];
let currentTargetIndex = 0;
const MAX_PHOTOS = 5;

// Flash overlay element
const flashOverlay = document.createElement('div');
flashOverlay.style.position = 'absolute';
flashOverlay.style.top = '0';
flashOverlay.style.left = '0';
flashOverlay.style.width = '100%';
flashOverlay.style.height = '100%';
flashOverlay.style.background = 'rgba(255,255,255,0.6)';
flashOverlay.style.zIndex = '10';
flashOverlay.style.opacity = '0';
flashOverlay.style.transition = 'opacity 0.2s ease-out';
document.getElementById('video-section').appendChild(flashOverlay);

function triggerFlash() {
  flashOverlay.style.opacity = '1';
  setTimeout(() => { flashOverlay.style.opacity = '0'; }, 100);
}

function updateDirectionOverlay(direction) {
  const label = document.getElementById('direction-label');
  const arrow = document.getElementById('direction-arrow');
  if (!label || !arrow) return;

  if (direction === 'Done!') {
    label.innerText = 'All Done!';
    arrow.innerText = '✅';
  } else {
    label.innerText = `Look ${direction}`;
    arrow.innerText = direction === 'Left' ? '⬅️' : direction === 'Right' ? '➡️' : '⬆️';
  }
}

updateDirectionOverlay(directions[currentTargetIndex]);

// Lightbox for gallery
const lightbox = document.createElement('div');
lightbox.style.position = 'fixed';
lightbox.style.top = '0';
lightbox.style.left = '0';
lightbox.style.width = '100%';
lightbox.style.height = '100%';
lightbox.style.background = 'rgba(0,0,0,0.9)';
lightbox.style.display = 'none';
lightbox.style.justifyContent = 'center';
lightbox.style.alignItems = 'center';
lightbox.style.zIndex = '20';
const lightboxImg = document.createElement('img');
lightboxImg.style.maxWidth = '90%';
lightboxImg.style.maxHeight = '90%';
lightbox.appendChild(lightboxImg);
document.body.appendChild(lightbox);

lightbox.addEventListener('click', e => { if(e.target===lightbox) lightbox.style.display='none'; });

// Main
const run = async () => {
  let picsTaken = 0;

  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  const videoElement = document.getElementById("video-feed");
  videoElement.srcObject = stream;

  await new Promise(resolve => { videoElement.onloadedmetadata = () => { videoElement.play(); resolve(); } });

  await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
  await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
  await faceapi.nets.faceExpressionNet.loadFromUri('/models');
  console.log("Models Loaded");

  const canvas = document.getElementById('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const ctx = canvas.getContext('2d');

  const galleryContainer = document.getElementById('gallery-images');

  let lastCaptured = null;
  let captureTimeout = null;

  setInterval(async () => {
    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) return;
    if (picsTaken >= MAX_PHOTOS) return;

    const detections = await faceapi
      .detectAllFaces(videoElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceExpressions();

    const resizedDetections = faceapi.resizeResults(detections, {
      width: videoElement.videoWidth,
      height: videoElement.videoHeight
    });

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    faceapi.draw.drawDetections(canvas, resizedDetections);
    faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
    faceapi.draw.drawFaceExpressions(canvas, resizedDetections);

    resizedDetections.forEach(face => {
      const { landmarks, detection } = face;
      if (!landmarks) return;

      const nose = landmarks.getNose();
      const leftEye = landmarks.getLeftEye();
      const rightEye = landmarks.getRightEye();

      const noseX = nose[3].x, noseY = nose[3].y;
      const leftEyeX = leftEye[0].x, rightEyeX = rightEye[3].x;
      const leftEyeY = leftEye[0].y, rightEyeY = rightEye[3].y;

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

      const currentTarget = directions[currentTargetIndex];
      if (direction === currentTarget && direction !== lastCaptured && picsTaken < MAX_PHOTOS) {
        lastCaptured = direction;
        if (captureTimeout) clearTimeout(captureTimeout);

        captureTimeout = setTimeout(() => {
          triggerFlash(); // flash effect
          takePhotoAndSend(videoElement, direction, galleryContainer);
          picsTaken++;

          if (picsTaken < MAX_PHOTOS) {
            currentTargetIndex = (currentTargetIndex + 1) % directions.length;
            updateDirectionOverlay(directions[currentTargetIndex]);
          } else {
            updateDirectionOverlay('Done!');
            videoElement.style.filter = 'blur(6px)';
            canvas.style.filter = 'blur(6px)';
          }
        }, 1500);
      }
    });
  }, 200);
};

async function takePhotoAndSend(video, direction, galleryContainer) {
  const photoCanvas = document.createElement('canvas');
  photoCanvas.width = video.videoWidth;
  photoCanvas.height = video.videoHeight;

  const ctx = photoCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

  const dataUrl = photoCanvas.toDataURL('image/png');
  const blob = await (await fetch(dataUrl)).blob();

  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = `Photo facing ${direction}`;
  galleryContainer.appendChild(img);

  // Add click-to-zoom
  img.addEventListener('click', () => {
    lightboxImg.src = img.src;
    lightbox.style.display = 'flex';
  });

  console.log(`Captured photo facing ${direction}`);

 const accessToken = localStorage.getItem("accessToken");
 const refreshToken = localStorage.getItem("refreshToken");
  const fileName = `face_${direction}_${Date.now()}.png`;

  try {
    // Step 1: Request presigned URL from your backend
    const res = await fetch("https://inyourspace.tech/api/avatar/url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        fileNames: [fileName],
        fileTypes: ["image/png"],
      }),
    });

    // console.log("✅ Received presigned URL from backend:]\n", res.json());

    if (!res.ok) {
  const err = await res.text();
  throw new Error(`Failed to get upload URLs: ${err}`);
}
else if (res.status===401){
  // throw new Error(`Unauthorized: Please check your access token.`);
   const newToken = await fetch("https://inyourspace.tech/api/auth/refresh", {
     method: "POST",
     headers: {
       "Content-Type": "application/json",
       "Authorization": `Bearer ${refreshToken}`,
     },
     body: JSON.stringify({
       refreshToken: refreshToken,
     }),
   });

   if (!newToken.ok) {
     const err = await newToken.text();
     throw new Error(`Failed to refresh token: ${err}`);
   }

   const { accessToken: newAccessToken } = await newToken.json();
   localStorage.setItem("accessToken", newAccessToken);
}

const data = await res.json();
    const { uploadUrls } = data;
    console.log("✅ Presigned upload URL:", uploadUrls);

    const { uploadUrl, fileKey } = uploadUrls[0];

    // Step 2: Upload the image directly to S3
    const upload = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: blob,
    });
    if (!upload.ok) throw new Error("Failed to upload image to S3");

    console.log("✅ Uploaded image to S3:", fileKey);

    // Step 3: Mark uploaded in DB
    await fetch("https://inyourspace.tech/api/avatar/mark-uploaded", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ fileKey }),
    });

    console.log("✅ Marked as uploaded:", fileKey);

    /// confirmulpad endpoint hit to be done tomorrow
  } catch (err) {
    console.error("❌ Upload flow error:", err);
  }
}

// Start
run();
