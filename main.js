// import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';
import "firebase/database";


const firebaseConfig = {
  apiKey: "AIzaSyD2-ZqeVqJmDEWS05I8LUzmFhvmZaYroHg",
  authDomain: "sm-android-exp.firebaseapp.com",
  databaseURL: "https://sm-android-exp-default-rtdb.firebaseio.com",
  projectId: "sm-android-exp",
  storageBucket: "sm-android-exp.appspot.com",
  messagingSenderId: "17726529401",
  appId: "1:17726529401:web:648419106d4f82d7a859a8"
};


if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');
const swapCameraButton = document.getElementById('swapCameraButton');
const muteMicButton = document.getElementById('muteMicButton');
const videoContainer = document.querySelector('.video-container');
const buttonContainer = document.querySelector('.button-container');


// 1. Setup media sources
startCam();

var connId = Android.getConnId();
var guard = Android.getUserUid();


Android.showToast("Data received:  guard : "+ guard+" connection id : "+ connId  )

if (connId === null || connId === undefined || connId === "") 
{
  createOffer(guard);
  // Android.showToast("going to create offer")
}
else
{
  answerCall(connId);
}



async function  startCam()  {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

};

// 2. Create an offer
async function createOffer(userId) {


  // Reference Firestore collections for signaling
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');


  Android.showToast("Offer created here is connection id : "+ callDoc.id)


  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });

  const database = firebase.database();
  
 // Store connection ID in Realtime Database
database.ref('rooms/' + userId).update({
  connectionid: callDoc.id,
  isactive: true
});

  Android.showToast("Offer created")

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};


// 3. Answer the call with the unique ID
async function answerCall (connectionId)  {
  const callId = connectionId;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');
  // console.log('-------',callDoc)
  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };
 
  const callData = (await callDoc.get()).data();
 
  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));
 
  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);
 
  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };
 
  await callDoc.update({ answer });
 
  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};


hangupButton.addEventListener('click', hangup);
swapCameraButton.addEventListener('click', swapCamera);
muteMicButton.addEventListener('click', toggleMuteMic);

// Function to hang up the call
function hangup() {
  // Remove all elements
  remoteVideo.srcObject = null;
  webcamVideo.srcObject = null;

  videoContainer.innerHTML = '';

  // Display "Call Completed" text
  const callCompletedText = document.createElement('h2');
  callCompletedText.textContent = 'Call ended you can go back';
  callCompletedText.style.fontSize = '24px';
  callCompletedText.style.color = '#3498db'; // Blue color, you can change it
  callCompletedText.style.textAlign = 'center';
  videoContainer.appendChild(callCompletedText);

  // Disable buttons after hangup
  hangupButton.disabled = true;
  swapCameraButton.disabled = true;
  muteMicButton.disabled = true;
  disableCameraButton.disabled = true;
  buttonContainer.style.display = 'none';


  Android.showToast('call ended')
  window.Android.onHangup();

  }

// Function to swap the camera
async function swapCamera() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');

    if (videoDevices.length < 2) {
      console.log('No additional camera found');
      return;
    }

    const currentVideoTrack = localStream.getVideoTracks()[0];
    const currentDeviceIndex = videoDevices.findIndex(device => device.deviceId === currentVideoTrack.getSettings().deviceId);

    const newDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
    const newDeviceId = videoDevices[newDeviceIndex].deviceId;

    const constraints = {
      video: { deviceId: newDeviceId },
      audio: true,
    };

    const newStream = await navigator.mediaDevices.getUserMedia(constraints);

    // Replace the video track in the stream
    localStream.removeTrack(currentVideoTrack);
    localStream.addTrack(newStream.getVideoTracks()[0]);

    // Replace the track in the peer connection
    const sender = pc.getSenders().find(s => s.track === currentVideoTrack);
    sender.replaceTrack(newStream.getVideoTracks()[0]);

    console.log('Camera swapped');

  } catch (error) {
    console.error('Error swapping camera:', error);
  }
}



// Function to mute/unmute the microphone
function toggleMuteMic() {
  // Toggle audio tracks
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !track.enabled;

  });
  changeMicImage();


// toggle image
  console.log('Microphone toggled');
}

function changeMicImage() {
  const muteMicButton = document.getElementById("muteMicButton");
  const muteMicImage = muteMicButton.querySelector('img');

  if (muteMicImage.src.includes("unmuted.png")) {
    muteMicButton.innerHTML = '<img src="./icons/muted.png" />';
  } else {
    console.log("i am setting muted")
    muteMicButton.innerHTML = '<img src="./icons/unmuted.png" />';
  }
}



function hideAllButtons() {
  console.log('hideAllButtons function called');
  var buttonContainer = document.querySelector('.button-container');
  if (buttonContainer) {
      var buttons = buttonContainer.querySelectorAll('.control-button');
      buttons.forEach(function(button) {
          button.style.display = 'none';
      });
  }
  Android.showToast("buttons hidden");
}





