console.log(faceapi);

const directions = ["Center", "Left", "Right"];
let currentTargetIndex = 0;
const MAX_PHOTOS = 3;
let uploadedFileKeys = [];
let centerMessage = null;
let centerMessageUntil = 0;
let stableSince = null;
const STABILITY_DURATION = 800; // ms required to hold still

// Flash overlay element
const flashOverlay = document.createElement("div");
flashOverlay.style.position = "absolute";
flashOverlay.style.top = "0";
flashOverlay.style.left = "0";
flashOverlay.style.width = "100%";
flashOverlay.style.height = "100%";
flashOverlay.style.background = "rgba(255,255,255,0.6)";
flashOverlay.style.zIndex = "10";
flashOverlay.style.opacity = "0";
flashOverlay.style.transition = "opacity 0.2s ease-out";
document.getElementById("video-section").appendChild(flashOverlay);
let neutralVertical = null;
let verticalSamples = [];

async function triggerFlash() {
  showCenterMessage([`Capturing...`], 500);
  await new Promise((resolve) => setTimeout(resolve, 50));
  flashOverlay.style.opacity = "1";
  setTimeout(() => {
    flashOverlay.style.opacity = "0";
  }, 100);
}

function updateDirectionOverlay(direction) {
  const label = document.getElementById("direction-label");
  const arrow = document.getElementById("direction-arrow");
  if (!label || !arrow) return;

  if (direction === "Done!") {
    label.innerText = "All Done!";
    arrow.innerText = "✅";
  } else {
    label.innerText = `Look ${direction}`;
    arrow.innerText =
      direction === "Left" ? "⬅️" : direction === "Right" ? "➡️" : "⬆️";
  }
}

updateDirectionOverlay(directions[currentTargetIndex]);

// Lightbox for gallery
const lightbox = document.createElement("div");
lightbox.style.position = "fixed";
lightbox.style.top = "0";
lightbox.style.left = "0";
lightbox.style.width = "100%";
lightbox.style.height = "100%";
lightbox.style.background = "rgba(0,0,0,0.9)";
lightbox.style.display = "none";
lightbox.style.justifyContent = "center";
lightbox.style.alignItems = "center";
lightbox.style.zIndex = "20";
const lightboxImg = document.createElement("img");
lightboxImg.style.maxWidth = "90%";
lightboxImg.style.maxHeight = "90%";
lightbox.appendChild(lightboxImg);
document.body.appendChild(lightbox);

lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) lightbox.style.display = "none";
});

// Main
const run = async () => {
  let picsTaken = 0;
  let lastStableFace = null;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
  });
  const videoElement = document.getElementById("video-feed");
  videoElement.srcObject = stream;

  await new Promise((resolve) => {
    videoElement.onloadedmetadata = () => {
      videoElement.play();
      resolve();
    };
  });

  // await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
  // await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
  // await faceapi.nets.faceExpressionNet.loadFromUri('/models');
  // console.log("Models Loaded");

  showCenterMessage(
    ["Models Loading", "Look straight for a few seconds"],
    3000,
  );

  const canvas = document.getElementById("canvas");
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const ctx = canvas.getContext("2d");

  const galleryContainer = document.getElementById("gallery-images");

  let lastCaptured = null;
  let captureTimeout = null;

  setInterval(async () => {
    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) return;
    if (picsTaken >= MAX_PHOTOS) return;

    const detections = await faceapi
      .detectAllFaces(
        videoElement,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 224,
          scoreThreshold: 0.5,
        }),
      )
      .withFaceLandmarks()
      .withFaceExpressions();

    const resizedDetections = faceapi.resizeResults(detections, {
      width: videoElement.videoWidth,
      height: videoElement.videoHeight,
    });

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    faceapi.draw.drawDetections(canvas, resizedDetections);
    faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
    faceapi.draw.drawFaceExpressions(canvas, resizedDetections);

    drawCenterMessage(ctx, canvas);

    resizedDetections.forEach((face) => {
      const { landmarks, detection } = face;
      if (!landmarks) return;

      /* ================= PHONE DISTANCE CHECK ================= */

      const faceBox = detection.box;
      const faceRatio = faceBox.width / videoElement.videoWidth;
      console.log("Face ratio:", faceRatio.toFixed(2));

      /* ===== DISTANCE CHECK ===== */
      if (faceRatio < 0.55) {
        showCenterMessage(["Move closer to your phone"], 3000);
        return;
      }

      if (!isFaceFullyVisible(face, videoElement)) {
        showCenterMessage(
          ["Ensure your full face is visible", "No cropping or tilt"],
          600,
        );
        return;
      }

      const nose = landmarks.getNose();
      const leftEye = landmarks.getLeftEye();
      const rightEye = landmarks.getRightEye();

      const noseX = nose[3].x,
        noseY = nose[3].y;
      const leftEyeX = leftEye[0].x,
        rightEyeX = rightEye[3].x;
      const leftEyeY = leftEye[0].y,
        rightEyeY = rightEye[3].y;

      const leftDist = Math.abs(noseX - leftEyeX);
      const rightDist = Math.abs(rightEyeX - noseX);
      const eyeAvgY = (leftEyeY + rightEyeY) / 2;
      const verticalDiff = noseY - eyeAvgY;

      /* ============ VERTICAL CALIBRATION (CENTER) ============ */

      // let direction = 'Center';
      // if (leftDist > rightDist * 1.1) direction = 'Left';
      // else if (rightDist > leftDist * 1.1) direction = 'Right';
      // else if (verticalDiff > 15) direction = 'Down';
      // else if (verticalDiff < -10) direction = 'Up';

      const STRAIGHT_TOLERANCE = 1.23; // lower = stricter
      const VERTICAL_TOLERANCE_UP = -10; // Nose too high → looking up
      const VERTICAL_TOLERANCE_DOWN = 15; // Nose too low → looking down
      const eyeBalance = leftDist / rightDist;
      const NEUTRAL_VERTICAL = 51.97; // straight-looking baseline
      const PRE_VERTICAL_CENTER = 56; // approx straight (your observed value)
      const PRE_VERTICAL_TOLERANCE = 0; // allow small error before calibration
      const FINAL_VERTICAL_TOLERANCE = 10;
      const VERTICAL_SAMPLE_COUNT = 12;

      let direction = "Center";
      if (currentTargetIndex === 1 && leftDist > rightDist * 1.5)
        direction = "Left";
      else if (currentTargetIndex === 2 && rightDist > leftDist * 1.5)
        direction = "Right";
      // if (currentTargetIndex === 0 && (faceRatio < 0.35)) direction = 'Center'; // first photo auto

      // calibration logic
      if (currentTargetIndex === 0 && neutralVertical === null) {
        // if ( neutralVertical === null) {
        // Distance check
        if (faceRatio < 0.55) {
          showCenterMessage(["Move closer to your phone"], 500);
          direction = null;
          return;
        }

        // LEFT / RIGHT check
        if (
          eyeBalance > STRAIGHT_TOLERANCE ||
          eyeBalance < 1 / STRAIGHT_TOLERANCE
        ) {
          showCenterMessage(["Look straight at the camera"], 500);
          direction = null;
          return;
        }

        // // UP / DOWN check (PRE-CALIBRATION WINDOW)
        // if (
        //   verticalDiff < PRE_VERTICAL_CENTER - PRE_VERTICAL_TOLERANCE ||
        //   verticalDiff > PRE_VERTICAL_CENTER + PRE_VERTICAL_TOLERANCE
        // ) {
        //   console .log("Pre-calibration vertical off:", verticalDiff.toFixed(2));
        //   showCenterMessage(["Level your head"], 500);
        //   direction = null;
        //   return;
        // }

        const verticalOffset = verticalDiff - PRE_VERTICAL_CENTER;

        if (verticalOffset < -PRE_VERTICAL_TOLERANCE) {
          // Nose is too high → user might need to lower phone or lower chin
          showCenterMessage(["Lower your head or phone slightly"], 500);
          console.log(
            "Pre-calibration vertical too high:",
            verticalDiff.toFixed(2),
          );
          direction = null;
          return;
        } else if (verticalOffset > PRE_VERTICAL_TOLERANCE) {
          // Nose is too low → user might need to lift phone or chin
          showCenterMessage(["Raise your head or phone slightly"], 500);
          console.log(
            "Pre-calibration vertical too low:",
            verticalDiff.toFixed(2),
          );
          direction = null;
          return;
        }

        // ✅ Only check vertical if we have a calibrated neutralVertical
        // else if (neutralVertical !== null) {
        //   const verticalOffset = verticalDiff - neutralVertical;

        //   if (verticalOffset < -FINAL_VERTICAL_TOLERANCE) {
        //     // Head is too low relative to neutral
        //     if (noseY > eyeAvgY + 15) {
        //       console.log("Phone angle low:", noseY, eyeAvgY);
        //       // Phone is angled too low
        //       showCenterMessage(["Raise your phone slightly"], 500);
        //     } else {
        //       // Head tilted down
        //       showCenterMessage(["Lift your chin slightly"], 500);
        //     }
        //     direction = null;
        //   }
        //   else if (verticalOffset > FINAL_VERTICAL_TOLERANCE) {
        //     // Head too high
        //     showCenterMessage(["Lower your chin slightly"], 500);
        //     direction = null;
        //   }
        //   else {
        //     // ✅ Vertical OK
        //     direction = 'Center';
        //   }
        // }

        // ✅ SAFE TO CALIBRATE
        verticalSamples.push(verticalDiff);
        showCenterMessage(["Hold still", "Calibrating…"], 500);

        if (verticalSamples.length >= VERTICAL_SAMPLE_COUNT) {
          neutralVertical =
            verticalSamples.reduce((a, b) => a + b, 0) / verticalSamples.length;

          console.log(
            "✅ Calibrated neutralVertical:",
            neutralVertical.toFixed(2),
          );
          showCenterMessage(["Calibration complete"], 1000);
        }

        direction = null;
        return;
      } else if (currentTargetIndex === 0) {
        // ❌ Too far
        if (faceRatio < 0.55) {
          showCenterMessage(["Move closer to your phone"], 500);
          direction = null; // block capture
        }
        // ❌ Looking left or right
        else if (
          eyeBalance > STRAIGHT_TOLERANCE ||
          eyeBalance < 1 / STRAIGHT_TOLERANCE
        ) {
          showCenterMessage(["Look straight at the camera"], 500);
          direction = null; // block capture
        }
        // ✅ Only check vertical if we have a calibrated neutralVertical
        else if (neutralVertical !== null) {
          if (verticalDiff < neutralVertical - FINAL_VERTICAL_TOLERANCE) {
            showCenterMessage(["Lower your chin slightly"], 500);
            direction = null;
          } else if (
            verticalDiff >
            neutralVertical + FINAL_VERTICAL_TOLERANCE
          ) {
            showCenterMessage(["Lift your chin slightly"], 500);
            direction = null;
          }
          // ✅ All checks passed
          else {
            direction = "Center";
          }
        }
        // ⚡ If neutralVertical is null, allow calibration but do not capture
        else {
          direction = null;
        }
      }

      new faceapi.draw.DrawTextField(
        [direction],
        detection.box.bottomLeft,
      ).draw(canvas);

      const currentTarget = directions[currentTargetIndex];
      if (!direction) return;
      if (
        direction === currentTarget &&
        direction !== lastCaptured &&
        picsTaken < MAX_PHOTOS
      ) {
        const stable = isFaceStable(face, lastStableFace, 8);

        if (!stable) {
          stableSince = null;
          showCenterMessage(["Hold still…"], 500);
          lastStableFace = face;
          return;
        }

        if (!stableSince) {
          stableSince = Date.now();
          showCenterMessage(["Hold still…"], 500);
          lastStableFace = face;
          return;
        }
        const heldTime = Date.now() - stableSince;
        const percent = Math.min(
          100,
          Math.ceil((heldTime / STABILITY_DURATION) * 100),
        );
        if (heldTime < STABILITY_DURATION) {
          showCenterMessage([`Hold still… ${percent}%`], 500);
          lastStableFace = face;
          return;
        }

        // ✅ FACE STABLE — CAPTURE
        stableSince = null;
        lastStableFace = null;
        lastCaptured = direction;
        if (captureTimeout) clearTimeout(captureTimeout);

        captureTimeout = setTimeout(() => {
          // showCenterMessage([`Capturing ${direction}...`], 500);
          triggerFlash(); // flash effect
          takePhotoAndSend(videoElement, direction, galleryContainer);
          picsTaken++;

          if (picsTaken < MAX_PHOTOS) {
            currentTargetIndex = (currentTargetIndex + 1) % directions.length;
            updateDirectionOverlay(directions[currentTargetIndex]);
          } else {
            updateDirectionOverlay("Done!");
            videoElement.style.filter = "blur(6px)";
            canvas.style.filter = "blur(6px)";
          }
        }, 1500);
      }
    });
  }, 200);
};

async function takePhotoAndSend(video, direction, galleryContainer) {
  const photoCanvas = document.createElement("canvas");
  photoCanvas.width = video.videoWidth;
  photoCanvas.height = video.videoHeight;

  const ctx = photoCanvas.getContext("2d");
  ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

  const dataUrl = photoCanvas.toDataURL("image/png");
  const blob = await (await fetch(dataUrl)).blob();

  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = `Photo facing ${direction}`;
  galleryContainer.appendChild(img);

  // Add click-to-zoom
  img.addEventListener("click", () => {
    lightboxImg.src = img.src;
    lightbox.style.display = "flex";
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
        Authorization: `Bearer ${accessToken}`,
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
    } else if (res.status === 401) {
      // throw new Error(`Unauthorized: Please check your access token.`);
      const newToken = await fetch(
        "https://inyourspace.tech/api/auth/refresh",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${refreshToken}`,
          },
          body: JSON.stringify({
            refreshToken: refreshToken,
          }),
        },
      );

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

    uploadedFileKeys.push(fileKey);

    // Step 3: Mark uploaded in DB
    const saveDB = await fetch(
      "https://inyourspace.tech/api/avatar/mark-uploaded",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ fileKey }),
      },
    );
    if (!saveDB.ok) {
      const err = await saveDB.text();
      throw new Error(`Failed to mark upload in DB: ${err}`);
    }
    console.log("✅ Marked as uploaded:", fileKey);
    console.log(`Uploaded ${uploadedFileKeys.length} of ${MAX_PHOTOS} photos.`);

    if (uploadedFileKeys.length === MAX_PHOTOS) {
      console.log("All photos uploaded! Confirming...");
      const confirmRes = await fetch(
        "https://inyourspace.tech/api/avatar/confirm",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          // body: JSON.stringify({ fileKeys: uploadedFileKeys }),
        },
      );

      if (!confirmRes.ok) {
        const err = await confirmRes.text();
        throw new Error(`Failed to confirm uploads: ${err}`);
      }

      const confirmData = await confirmRes.json();
      console.log("✅ Training confirmed:", confirmData);
      // Hide camera UI
      document.getElementById("video-feed").style.display = "none";
      document.getElementById("canvas").style.display = "none";

      // Show pretty loading page
      showLoadingScreen();

      // Close WebView after short delay
      setTimeout(() => {
        closeWebView();
      }, 2500);
    }
  } catch (err) {
    console.error("❌ Upload flow error:", err);
  }
}
function showCenterMessage(lines, duration = 3000) {
  centerMessage = lines;
  centerMessageUntil = Date.now() + duration;
}

function drawCenterMessage(ctx, canvas) {
  if (!centerMessage || Date.now() > centerMessageUntil) return;

  ctx.save();
  ctx.font = "bold 26px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2 + 70; // 🔽 LOWERED
  const padding = 18;
  const lineHeight = 32;
  const boxWidth = 420;
  const boxHeight = centerMessage.length * lineHeight + padding * 2;

  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(
    centerX - boxWidth / 2,
    centerY - boxHeight / 2,
    boxWidth,
    boxHeight,
  );

  ctx.fillStyle = "#fff";
  centerMessage.forEach((line, i) => {
    ctx.fillText(
      line,
      centerX,
      centerY - ((centerMessage.length - 1) * lineHeight) / 2 + i * lineHeight,
    );
  });

  ctx.restore();
}

function closeWebView() {
  if (window.ReactNativeWebView) {
    // React Native WebView
    window.ReactNativeWebView.postMessage("close");
  } else {
    // Browser fallback
    window.close();
    window.location.href = "about:blank";
  }
}

function showLoadingScreen() {
  const screen = document.getElementById("loading-screen");
  screen.style.display = "flex";
}

// JS - Replace your old run() call with this

function isFaceFullyVisible(face, videoElement) {
  const { detection, landmarks } = face;

  if (!detection || !landmarks) return false;

  // 1️⃣ Face box inside frame
  const box = face.detection.box;
  const margin = 2;

  if (
    box.x < margin ||
    box.y < margin ||
    box.x + box.width > videoElement.videoWidth - margin ||
    box.y + box.height > videoElement.videoHeight - margin
  ) {
    return false;
  }

  // 2️⃣ Face size sanity check
  const faceRatio = box.width / videoElement.videoWidth;
  if (faceRatio < 0.1 || faceRatio > 0.65) return false;

  // 3️⃣ Required landmarks exist
  const required = [
    landmarks.getLeftEye(),
    landmarks.getRightEye(),
    landmarks.getNose(),
    landmarks.getMouth(),
    landmarks.getJawOutline(),
  ];

  if (required.some((p) => !p || p.length === 0)) return false;

  // 4️⃣ Eye alignment (no heavy tilt)
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();

  const leftEyeY = leftEye.reduce((s, p) => s + p.y, 0) / leftEye.length;
  const rightEyeY = rightEye.reduce((s, p) => s + p.y, 0) / rightEye.length;

  if (Math.abs(leftEyeY - rightEyeY) > 22) return false;

  return true;
}

function isFaceStable(face, lastFace, tolerance = 8) {
  if (!lastFace) return true;

  const a = face.detection.box;
  const b = lastFace.detection.box;

  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const dw = Math.abs(a.width - b.width);
  const dh = Math.abs(a.height - b.height);

  // movement tolerance (pixels)
  return (
    dx <= tolerance && dy <= tolerance && dw <= tolerance && dh <= tolerance
  );
}

async function showWelcomeThenLoad() {
  const welcomeScreen = document.getElementById("welcome-screen");
  const videoSection = document.getElementById("video-section");
  const continueBtn = document.getElementById("continue-btn");
  continueBtn.disabled = true;
  continueBtn.textContent = "Loading AI Models...";

  // Load models
  await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
  await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
  await faceapi.nets.faceExpressionNet.loadFromUri("/models");
  console.log("Models Loaded");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Enable button once models are ready
  continueBtn.disabled = false;

  continueBtn.textContent = "Continue";

  // Wait for user to click Continue
  await new Promise((resolve) => {
    continueBtn.addEventListener("click", resolve, { once: true });
  });

  // Hide welcome screen
  welcomeScreen.style.display = "none";
  // Show camera section
  videoSection.style.display = "block";

  // Start the camera and capture
  run(); // your existing run() function
}
// Start everything via welcome screen
showWelcomeThenLoad();
