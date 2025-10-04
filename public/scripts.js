console.log(faceapi)

const run = async () => {
    let picsTaken = 0
    // Start webcam
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    const videoElement = document.getElementById("video-feed")
    videoElement.srcObject = stream

    // Load models
    await faceapi.nets.tinyFaceDetector.loadFromUri('/models')
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models')
    await faceapi.nets.faceExpressionNet.loadFromUri('/models')
    console.log("Models Loaded")

    const canvas = document.getElementById('canvas')
    canvas.style.left = videoElement.offsetLeft + 'px'
    canvas.style.top = videoElement.offsetTop + 'px'
    canvas.width = videoElement.width
    canvas.height = videoElement.height

    const ctx = canvas.getContext('2d')
    const galleryContainer = document.createElement('div')
    galleryContainer.id = 'photo-gallery'
    document.body.appendChild(galleryContainer)

    let lastCaptured = null
    let captureTimeout = null

    setInterval(async () => {
        const detections = await faceapi.detectAllFaces(videoElement,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
        )
            .withFaceLandmarks()
            .withFaceExpressions()

        const resizedDetections = faceapi.resizeResults(detections, { width: videoElement.width, height: videoElement.height })

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        faceapi.draw.drawDetections(canvas, resizedDetections)
        faceapi.draw.drawFaceLandmarks(canvas, resizedDetections)
        faceapi.draw.drawFaceExpressions(canvas, resizedDetections)

        resizedDetections.forEach(face => {
            const { landmarks, detection } = face
            if (!landmarks) return

            const nose = landmarks.getNose()
            const leftEye = landmarks.getLeftEye()
            const rightEye = landmarks.getRightEye()

            const noseX = nose[3].x
            const noseY = nose[3].y
            const leftEyeX = leftEye[0].x
            const rightEyeX = rightEye[3].x
            const leftEyeY = leftEye[0].y
            const rightEyeY = rightEye[3].y

            const leftDist = Math.abs(noseX - leftEyeX)
            const rightDist = Math.abs(rightEyeX - noseX)
            const eyeAvgY = (leftEyeY + rightEyeY) / 2
            const verticalDiff = noseY - eyeAvgY

            let direction = 'Center'
            if (leftDist > rightDist * 1.2) direction = 'Left'
            else if (rightDist > leftDist * 1.2) direction = 'Right'
            else if (verticalDiff > 15) direction = 'Down'
            else if (verticalDiff < -15) direction = 'Up'

            new faceapi.draw.DrawTextField([direction], detection.box.bottomLeft).draw(canvas)

            // Capture photo 1.5 seconds after orientation change
            if (['Left', 'Right', 'Down'].includes(direction) && direction !== lastCaptured) {
                lastCaptured = direction

                // Clear any existing timeout to avoid multiple captures
                if (captureTimeout) clearTimeout(captureTimeout)

                if (picsTaken >= 3) return
                captureTimeout = setTimeout(() => {
                    takePhotoAndSend(videoElement, direction, galleryContainer)
                    picsTaken++;
                }, 1000) // 1.5 seconds
            }

            console.log('Face Direction:', direction)
        })

    }, 200)
}

async function takePhotoAndSend(video, direction, galleryContainer) {
    const photoCanvas = document.createElement('canvas')
    photoCanvas.width = video.videoWidth
    photoCanvas.height = video.videoHeight
    const ctx = photoCanvas.getContext('2d')
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight)

    const dataUrl = photoCanvas.toDataURL('image/png')

    // Display in gallery
    const img = document.createElement('img')
    img.src = dataUrl
    img.alt = `Photo facing ${direction}`
    galleryContainer.appendChild(img)

    // Send to API
    // try {
    //     const response = await fetch('https://your-api-endpoint.com/upload', {
    //         method: 'POST',
    //         headers: { 'Content-Type': 'application/json' },
    //         body: JSON.stringify({ image: dataUrl, direction: direction })
    //     })
    //     const result = await response.json()
    //     console.log('API response:', result)
    // } catch (err) {
    //     console.error('API upload error:', err)
    // }

    console.log(`Captured photo facing ${direction}`)
}

run()



// console.log(faceapi)

// const run = async()=>{
//     //loading the models is going to use await
//     const stream = await navigator.mediaDevices.getUserMedia({
//         video: true,
//         audio: false,
//     })
//     const videoFeedEl = document.getElementById('video-feed')
//     videoFeedEl.srcObject = stream
//     //we need to load our models
//     // pre-trained machine learning for our facial detection!
//     await Promise.all([
//         faceapi.nets.ssdMobilenetv1.loadFromUri('./models'),
//         faceapi.nets.faceLandmark68Net.loadFromUri('./models'),
//         faceapi.nets.faceRecognitionNet.loadFromUri('./models'),
//         faceapi.nets.ageGenderNet.loadFromUri('./models'),
//         faceapi.nets.faceExpressionNet.loadFromUri('./models'),
//     ])
//     console.log('Models Loaded')

//     //make the canvas the same size and in the same location
//     // as our video feed
//     const canvas = document.getElementById('canvas')
//     canvas.style.left = videoFeedEl.offsetLeft
//     canvas.style.top = videoFeedEl.offsetTop
//     canvas.height = videoFeedEl.height
//     canvas.width = videoFeedEl.width

//     /////OUR FACIAL RECOGNITION DATA
//     // we KNOW who this is (Michael Jordan)
//     const refFace = await faceapi.fetchImage('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Michael_Jordan_in_2014.jpg/220px-Michael_Jordan_in_2014.jpg')
//     //we grab the reference image, and hand it to detectAllFaces method
//     let refFaceAiData = await faceapi.detectAllFaces(refFace).withFaceLandmarks().withFaceDescriptors()
//     let faceMatcher = new faceapi.FaceMatcher(refFaceAiData)

//     // facial detection with points
//     setInterval(async()=>{
//         // get the video feed and hand it to detectAllFaces method
//         let faceAIData = await faceapi.detectAllFaces(videoFeedEl).withFaceLandmarks().withFaceDescriptors().withAgeAndGender().withFaceExpressions()
//         // console.log(faceAIData)
//         // we have a ton of good facial detection data in faceAIData
//         // faceAIData is an array, one element for each face

//         // draw on our face/canvas
//         //first, clear the canvas
//         canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height)
//         // draw our bounding box
//         faceAIData = faceapi.resizeResults(faceAIData,videoFeedEl)
//         faceapi.draw.drawDetections(canvas,faceAIData)
//         faceapi.draw.drawFaceLandmarks(canvas,faceAIData)
//         faceapi.draw.drawFaceExpressions(canvas,faceAIData)

//         // ask AI to guess age and gender with confidence level
//         faceAIData.forEach(face=>{
//             const { age, gender, genderProbability, detection, descriptor } = face
//             const genderText = `${gender} - ${Math.round(genderProbability*100)/100*100}`
//             const ageText = `${Math.round(age)} years`
//             const textField = new faceapi.draw.DrawTextField([genderText,ageText],face.detection.box.topRight)
//             textField.draw(canvas)

//             let label = faceMatcher.findBestMatch(descriptor).toString()
//             // console.log(label)
//             let options = {label: "Jordan"}
//             if(label.includes("unknown")){
//                 options = {label: "Unknown subject..."}
//             }
//             const drawBox = new faceapi.draw.DrawBox(detection.box, options)
//             drawBox.draw(canvas)
//         })
        

//     },200)

// }

// run()