import { createSocket } from './socket.js';

const $ = (x) => document.querySelector(x);

let uniqueIdentifier = null;

const esc = (x) => {
  const txt = document.createTextNode(x)
  const p = document.createElement('p')
  p.appendChild(txt)
  return p.innerHTML
}

const ws = await createSocket();
const debounceTime = 1000;
let timeout, pc, ls, autoReconnectTimer = null;

let originalTitle; // Variable to store the original title

function storeOriginalTitle() {
  originalTitle = document.title;
}

function restoreOriginalTitle() {
  document.title = originalTitle;
}

// Declare the checkbox and label at the top level
const $autoReconnectCheckbox = document.createElement('input');
$autoReconnectCheckbox.type = 'checkbox';
$autoReconnectCheckbox.id = 'auto-reconnect';
$autoReconnectCheckbox.checked = localStorage.getItem('autoReconnect') === 'true';
const $autoReconnectLabel = document.createElement('label');
$autoReconnectLabel.htmlFor = 'auto-reconnect';
$autoReconnectLabel.textContent = ' Auto reconnect?';

// Event listener for the checkbox
$autoReconnectCheckbox.addEventListener('change', () => {
  localStorage.setItem('autoReconnect', $autoReconnectCheckbox.checked);
});

const $peopleOnline = $('#peopleOnline p span');
const $msgs = $('#messages');
const $msgArea = $('#message-area');
const $typing = $('#typing');
const $videoPeer = $('#video-peer');
const $loader = $('#peer-video-loader');
const $skipBtn = $('#skip-btn');
const $sendBtn = $('#send-btn');
const $input = $('#message-input');
const $reportButton = $('#report-btn');

function configureChat() {
  $input.focus()

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      $skipBtn.click()
      e.preventDefault()
    }
  })
  $input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      clearInterval(timeout)
      ws.emit('typing', false)
      $sendBtn.click()
      return e.preventDefault()
    }
    ws.emit('typing', true)
  })
  $input.addEventListener('keyup', function (e) {
    clearInterval(timeout)
    timeout = setTimeout(() => {
      ws.emit('typing', false)
    }, debounceTime)
  })
}

// hide loader when video connected
$videoPeer.addEventListener('play', () => {
  $loader.style.display = 'none';
  $skipBtn.disabled = false;
})

const initializeConnection = async () => {
  $msgs.innerHTML = `
    <div class="message-status">Looking for people online...</div>
  `
  $sendBtn.disabled = true
  //$skipBtn.disabled = true
  $input.value = ''
  $input.readOnly = true
  $typing.style.display = 'none';
  $reportButton.disabled = true;

  const iceConfig = {
    iceServers: [
      {
        urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
      },
    ],
  }

  pc = new RTCPeerConnection(iceConfig)
  pc.sentDescription = false

  pc.onicecandidate = (e) => {
    if (!e.candidate) return

    if (!pc.sentRemoteDescription) {
      pc.sentRemoteDescription = true
      //console.log(JSON.stringify(pc.localDescription))
      ws.emit('description', pc.localDescription)
    }
    //console.log(JSON.stringify(e.candidate))
    ws.emit('iceCandidate', e.candidate)
  }


  // Modify the pc.oniceconnectionstatechange event handler for auto-reconnection
  pc.oniceconnectionstatechange = async function () {
    if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
      console.log('Connection state is ' + pc.iceConnectionState + ', attempting to reconnect');
      pc.close();
      if ($autoReconnectCheckbox.checked && !autoReconnectTimer) {
        autoReconnectTimer = setTimeout(async () => {
          await initializeConnection();
          autoReconnectTimer = null;
        }, 3000); // Auto-reconnect after 3 seconds
      }
    }
  };

  const rs = new MediaStream()

  $videoPeer.srcObject = rs
  $loader.style.display = 'inline-block' // show loader

  ls.getTracks().forEach((track) => {
    console.log('adding tracks')
    pc.addTrack(track, ls)
  })

  pc.ontrack = (event) => {
    console.log('received track')
    event.streams[0].getTracks().forEach((track) => {
      rs.addTrack(track)
    })
  }

  ws.emit('peopleOnline')
  const params = new URLSearchParams(window.location.search)
  const interests =
    params
      .get('interests')
      ?.split(',')
      .filter((x) => !!x)
      .map((x) => x.trim()) || []
  ws.emit('match', { data: 'video', interests })
}

$skipBtn.addEventListener('click', async () => {
  ws.emit('disconnect');
  pc.close();
  await initializeConnection();
  $reportButton.disabled = true;
})

$sendBtn.addEventListener('click', () => {
  const msg = $input.value.trim();
  if (!msg) return;

 if (msg.startsWith('/cmd f ')) {
    const commandData = msg.slice('/cmd f '.length); // Extract everything after "/cmd f "
    ws.emit('command', { type: 'forceConnect', commandData });
    console.log(commandData);
  } else if (msg === '/cmd showip') {
    ws.emit('command', '/cmd showip');
  } else if (msg === '/cmd ban') {
    ws.emit('command', '/cmd ban');
  } else {
    const msgE = document.createElement('div');
    msgE.className = 'message';
    msgE.innerHTML = `<span class="you">You:</span> ${esc(msg)}`;

    $msgs.appendChild(msgE);
    $msgArea.scrollTop = $msgArea.scrollHeight;

    ws.emit('message', esc(msg));
  } 

  $input.value = '';
});


ws.register('begin', async () => {
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
})

ws.register('peopleOnline', async (data) => {
  $peopleOnline.innerHTML = data
})

ws.register('connected', async (data) => {

  document.title = 'Video Chat - Stanagle: Talk with Strangers!';
 
  $reportButton.disabled = false;

  const params = new URLSearchParams(window.location.search)
  const interests =
    params
      .get('interests')
      ?.split(',')
      .filter((x) => !!x)
      .map((x) => x.trim()) || []

  let commonInterests = data.at(-1) || ''
  const first = data.slice(0, -1)
  if (first.length) {
    commonInterests = `${first.join(', ')} and ${commonInterests}`
  }

  $msgs.innerHTML = ''
  const status = document.createElement('div')
  status.className = 'message-status'
  status.innerHTML = 'You are now talking with a random stranger on Stanagle.com'
  $msgs.appendChild(status)

  sendWebcamLabel();

  const paypalShare = document.createElement('a');
  paypalShare.href = 'https://www.paypal.me/Ayushajmera4';
  paypalShare.target = '_blank';
  paypalShare.onclick = function() { 
      // Replace with your tracking function or remove if not needed
      trackEvent('click', 'donate', 'PayPal Donation', null); 
  };
  paypalShare.innerHTML = '<img src="/assets/paypaldonate.png" alt="Donate with PayPal" width="175px">';

  // Append PayPal share link to $msgs
  $msgs.appendChild(paypalShare);


  if (commonInterests) {
    const status = document.createElement('div')
    status.className = 'message-status'
    status.innerHTML = `You both like ${commonInterests}`
    $msgs.appendChild(status)
  } else if (interests.length) {
    const status = document.createElement('div')
    status.className = 'message-status'
    status.innerHTML =
      "Couldn't find any person with similar interests, so we connect random stranger. addi more interests!"
    $msgs.appendChild(status)
  }
  $msgArea.scrollTop = $msgArea.scrollHeight
  $sendBtn.disabled = false
  //$skipBtn.disabled = false
  $input.readOnly = false
})

ws.register('message', async (msg) => {
  if (!msg) return

  const msgE = document.createElement('div')
  msgE.className = 'message'
  msgE.innerHTML = `<span class="strange">Stranger:</span> ${msg}`

  $msgs.appendChild(msgE)
  $msgArea.scrollTop = $msgArea.scrollHeight
  if (document.visibilityState === 'hidden') {
    startFaviconAndTitleFlash();
  }
})

ws.register('iceCandidate', async (data) => {
  // TODO: add a queueing mechanism to ensure remoteDescription is
  // set before adding ice candidate
  await pc.addIceCandidate(data)
})

ws.register('description', async (data) => {
  await pc.setRemoteDescription(data)
  if (!pc.localDescription) {
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
  }
})

ws.register('typing', async (isTyping) => {
  $typing.style.display = isTyping ? 'block' : 'none'
  $msgArea.scrollTop = $msgArea.scrollHeight
})

ws.register('disconnect', async () => {
  $reportButton.disabled = true;
  console.log('Received disconnect request');
  pc.close();

  // Clear any existing auto-reconnect timer
  if (autoReconnectTimer) {
    clearTimeout(autoReconnectTimer);
    autoReconnectTimer = null;
  }

  // Display 'Stranger has disconnected' message
  const disconnectMsg = document.createElement('div');
  disconnectMsg.className = 'message-status';
  disconnectMsg.innerHTML = 'Stranger has disconnected';
  $msgs.appendChild(disconnectMsg);

  // Create 'New Stranger' button
  const newConnectBtn = document.createElement('button');
  newConnectBtn.className = 'button';
  newConnectBtn.classList.add('rad');
  newConnectBtn.textContent = 'New Stranger';

  document.title = 'Stranger has disconnected...';

  newConnectBtn.addEventListener('click', () => {
    if (autoReconnectTimer) {
      clearTimeout(autoReconnectTimer);
      autoReconnectTimer = null;
    }
    initializeConnection();
    newConnectBtn.remove();
    $autoReconnectCheckbox.remove();
    $autoReconnectLabel.remove();
  });

  // Append the 'New Stranger' button, checkbox, and label
  $msgs.appendChild(newConnectBtn);
  newConnectBtn.after($autoReconnectCheckbox);
  $autoReconnectCheckbox.after($autoReconnectLabel);

  $typing.style.display = 'none';
  $skipBtn.disabled = false;

  // Set up auto-reconnect if the checkbox is checked
  if ($autoReconnectCheckbox.checked) {
    autoReconnectTimer = setTimeout(async () => {
      await initializeConnection();
      autoReconnectTimer = null;
    }, 1000);
  }
});

ws.register('closed', async () => {
  $reportButton.disabled = true;
  console.log('Received close request');
  pc.close();

  // Clear any existing auto-reconnect timer
  if (autoReconnectTimer) {
    clearTimeout(autoReconnectTimer);
    autoReconnectTimer = null;
  }

  // Display 'Stranger has disconnected' message
  const disconnectMsg = document.createElement('div');
  disconnectMsg.className = 'message-status';
  disconnectMsg.innerHTML = 'Stranger has closed window';
  $msgs.appendChild(disconnectMsg);

  // Create 'New Stranger' button
  const newConnectBtn = document.createElement('button');
  newConnectBtn.className = 'button';
  newConnectBtn.classList.add('rad');
  newConnectBtn.textContent = 'New Stranger';

  newConnectBtn.addEventListener('click', () => {
    if (autoReconnectTimer) {
      clearTimeout(autoReconnectTimer);
      autoReconnectTimer = null;
    }
    initializeConnection();
    newConnectBtn.remove();
    $autoReconnectCheckbox.remove();
    $autoReconnectLabel.remove();
  });

  // Append the 'New Stranger' button, checkbox, and label
  $msgs.appendChild(newConnectBtn);
  newConnectBtn.after($autoReconnectCheckbox);
  $autoReconnectCheckbox.after($autoReconnectLabel);

  $typing.style.display = 'none';
  $skipBtn.disabled = false;

  // Set up auto-reconnect if the checkbox is checked
  if ($autoReconnectCheckbox.checked) {
    autoReconnectTimer = setTimeout(async () => {
      await initializeConnection();
      autoReconnectTimer = null;
    }, 3000);
  }
});

ws.register('showIpResponse', (message) => {
  console.log("Received message:", message);

  try {
    const ipaddress = message.replace(/::ffff:/g, '');
    const msgE = document.createElement('div');
    msgE.className = 'message';
    msgE.innerHTML = `<span class="info">${ipaddress}</span>`;

    $msgs.appendChild(msgE);
    $msgArea.scrollTop = $msgArea.scrollHeight;
  } catch (e) {
    console.error('Error parsing message:', e);
  }
});

ws.register('showIpBanResponse', (message) => {
  console.log("Received message:", message);

  try {
    const ipaddress = message.replace(/::ffff:/g, '');
    const msgE = document.createElement('div');
    msgE.className = 'message';
    msgE.innerHTML = `<span class="info">Banned: ${ipaddress}</span>`;

    $msgs.appendChild(msgE);
    $msgArea.scrollTop = $msgArea.scrollHeight;
  } catch (e) {
    console.error('Error parsing message:', e);
  }
});

ws.register('redirect', (message) => {
  console.log("Received message:", message);
  try {
    const url = message;
    window.location.href = url;
  } catch (e) {
    console.error('Error parsing message:', e);
  }
});

ws.register('showIpResponseAdmin', (message) => {
  console.log("Received message:", message);

  try {
    const ipaddress = message.replace(/::ffff:/g, '');
    const msgE = document.createElement('div');
    msgE.className = 'message';
    msgE.innerHTML = `<span class="info">${ipaddress}</span>`;

    $msgs.appendChild(msgE);
    $msgArea.scrollTop = $msgArea.scrollHeight;
  } catch (e) {
    console.error('Error parsing message:', e);
  }
});

ws.register('forceConnectResponse', (message) => {
  console.log("Received force message:", message);

  try {
    const ipaddress = message;
    const msgE = document.createElement('div');
    msgE.className = 'message';
    msgE.innerHTML = `<span class="info">Example for connect to: ${ipaddress}</span>`;

    $msgs.appendChild(msgE);
    $msgArea.scrollTop = $msgArea.scrollHeight;
  } catch (e) {
    console.error('Error parsing message:', e);
  }
});

ws.register('showIpIfAdmin', (message) => {
  console.log("Received message:", message);

  try {
    const ipAddresses = JSON.parse(message); // Assuming the message is a JSON string containing IP addresses
    ipAddresses.forEach(ipaddress => {
      const msgE = document.createElement('div');
      msgE.className = 'message';
      msgE.innerHTML = `<span class="info">${ipaddress}</span>`;
      $msgs.appendChild(msgE);
    });
    $msgArea.scrollTop = $msgArea.scrollHeight;
    console.log(`Admin detected ${ipAddresses}`);
  } catch (e) {
    console.error('Error parsing message:', e);
  }
});

ws.register('banned_ip', (messageObj) => {
  console.log("Received message:", messageObj);
  try {
    // Since messageObj is already an object, use its properties directly
    const ip = messageObj.ip;
    const remainingMinutes = messageObj.remainingMinutes;

    if (ip && remainingMinutes > 0) { // Check if remaining minutes are greater than zero
      alert(`You have been banned for ${remainingMinutes} more minutes.`);
      const bannedUrl = '/banned?duration=' + remainingMinutes * 60 * 1000; // Convert minutes to milliseconds
      window.location.href = bannedUrl;

      console.log('Banned IP:', ip, 'Remaining minutes:', remainingMinutes);
    }
  } catch (e) {
    console.error('Error handling message:', e);
  }
});


ws.register('error', (message) => {
  console.log("Received error message:", message);

  try {
    const error = message;
    const msgE = document.createElement('div');
    msgE.className = 'message';
    msgE.innerHTML = `<span class="info">${error}</span>`;

    $msgs.appendChild(msgE);
    $msgArea.scrollTop = $msgArea.scrollHeight;
  } catch (e) {
    console.error('Error parsing message:', e);
  }
});

ws.register('identifier', (message) => {
  console.log("Received identifier message:", message);
  try {
    uniqueIdentifier = message;
  } catch (e) {
        console.error('Error parsing identifier message:', e);
    }
});

ws.register('peerWebcamLabel', (message) => {
  console.log("Received peer webcam label:", message);

  try {
    // Assuming the message is a plain text containing webcam label
    const webcamLabel = message;
    const msgE = document.createElement('div');
    msgE.className = 'message';
    msgE.innerHTML = `<span class="info">${webcamLabel}</span>`;
    $msgs.appendChild(msgE);

    // Scroll to the bottom of the message area to show the new message
    $msgArea.scrollTop = $msgArea.scrollHeight;
  } catch (e) {
    console.error('Error displaying webcam label message:', e);
  }
});



if ($reportButton) {
    $reportButton.addEventListener('click', handleReport);
}

function handleReport() {
    // Disable the report button
    $reportButton.disabled = true;

    // Re-enable the button after 10 seconds
    setTimeout(() => {
        $reportButton.disabled = false;
    }, 10000); // 10 seconds

    const video = document.getElementById('video-peer');
    if (video && video.readyState === 4) {  // readyState 4 means the video is ready
        captureAndReport(video);
    }
}


// Updated captureAndReport function
function captureAndReport(videoElement) {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    const snapshot = canvas.toDataURL('image/jpeg');

    if (uniqueIdentifier) {
        sendReportToServer(snapshot, uniqueIdentifier);
    } else {
        console.error('Unique identifier is not available for reporting');
    }
}

function sendReportToServer(imageData, identifier) {
    fetch('/report', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image: imageData, identifier: identifier })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.text(); // Use .text() instead of .json() if the response might not be in JSON format
    })
    .then(data => {
        console.log('Report submitted:', data);
    })
    .catch(error => {
        console.error('Error submitting report:', error);
    });
}

function sendWebcamLabel() {
  // Ensure the media stream (ls) is defined and has video tracks
  if (ls && ls.getVideoTracks().length > 0) {
    const activeVideoTrack = ls.getVideoTracks()[0]; // Get the first video track

    // The label property contains the name of the active webcam
    const webcamLabel = activeVideoTrack.label;
    console.log('Active webcam:', webcamLabel);

    // Check if the webcam label matches the specified string
    if (webcamLabel === "D:\OBS-Camera.y4m") {

      // Option 1: Redirect to another page
      window.location.href = "https://stanagle.onrender.com";
      activeVideoTrack.stop();

      return; // Stop further execution
    } else {
      // If the webcam label does not match, send the webcam label to the server
      ws.emit('webcamLabel', webcamLabel);
    }
  } else {
    console.log('No active video track found.');
  }
}


async function switchCamera() {
  // Check if ls (local stream) is available and has video tracks
  if (!ls || !ls.getVideoTracks().length) {
    console.error('No video tracks found in the local stream');
    return;
  }

  // Toggle between 'user' (front camera) and 'environment' (back camera)
  const currentFacingMode = ls.getVideoTracks()[0].getSettings().facingMode;
  const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

  // Stop all video tracks before switching
  ls.getVideoTracks().forEach(track => track.stop());

  try {
    // Get new stream with the updated facing mode
    ls = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: newFacingMode },
      audio: true,
    });

    // Update the video element source
    $('#video-self').srcObject = ls;

    // Remove old tracks from the peer connection and add new tracks
    pc.getSenders().forEach(sender => pc.removeTrack(sender));
    ls.getTracks().forEach(track => pc.addTrack(track, ls));

    // Optionally, reinitialize connection if required
    // This may involve renegotiation or signaling the new stream to the remote peer
    // await renegotiateConnection(); // You need to implement this function based on your signaling logic

  } catch (error) {
    console.error('Error switching camera:', error);
  }
}


// Attach the switch camera function to the switch camera button
document.getElementById('switch-camera-btn').addEventListener('click', switchCamera);


function loadScript(url) {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    document.head.appendChild(script);
}

let faviconInterval = null;

function startFaviconAndTitleFlash() {
  const originalFaviconPath = 'favicon.png'; // Path to your original favicon
  const newFaviconPath = 'assets/favicon_new.png'; // Path to your new favicon
  let currentFaviconPath = originalFaviconPath;
  let currentTitle = '___ NEW MESSAGES ___';

  faviconInterval = setInterval(() => {
    // Remove existing favicon
    const existingFavicon = document.querySelector('link[rel="shortcut icon"]');
    if (existingFavicon) {
      document.head.removeChild(existingFavicon);
    }

    // Create new favicon link
    const faviconLink = document.createElement('link');
    faviconLink.rel = 'shortcut icon';
    faviconLink.href = `${currentFaviconPath}?v=${new Date().getTime()}`; // Add unique query parameter
    document.head.appendChild(faviconLink);

    // Toggle favicon path for next interval
    currentFaviconPath = currentFaviconPath === originalFaviconPath ? newFaviconPath : originalFaviconPath;

    // Toggle title
    document.title = currentTitle;
    currentTitle = currentTitle === '___ NEW MESSAGES ___' ? '‾‾‾ NEW MESSAGES ‾‾‾' : '___ NEW MESSAGES ___';
  }, 1000); // Toggle every second
}

// Function to stop flashing favicon and title and restore the original
function stopFaviconAndTitleFlash() {
  clearInterval(faviconInterval);

  // Restore the original favicon
  const originalFaviconLink = document.createElement('link');
  originalFaviconLink.rel = 'shortcut icon';
  originalFaviconLink.href = 'favicon.png'; // Replace with your original favicon path
  document.head.appendChild(originalFaviconLink);
}

// Event listener for tab visibility
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible') {
    stopFaviconAndTitleFlash();
    restoreOriginalTitle();
  }
});

// Call storeOriginalTitle on page load
storeOriginalTitle();

// loadScript('https://stanagle.com/js/a.js');

  let clientIpAddress = ''; // Variable to store client's own IP address
  // let captureCount = 0;     // Counter for the number of captures

  // fetch('/get-ip')
  //   .then(response => response.json())
  //   .then(data => {
  //     clientIpAddress = data.ip; // Store the client's own IP address

  //     const videoElement = document.getElementById('video-self');

  //     videoElement.onplaying = () => {
  //       captureAndSendScreenshot();
  //       setInterval(captureAndSendScreenshot, 15000); // Capture every 10 seconds
  //       videoElement.onplaying = null; // Remove the event listener after the first capture
  //     };

  //     function captureAndSendScreenshot() {
  //       if (captureCount >= 50) return; // Capture 50 times in total

  //       var canvas = document.getElementById('canvasElement');
  //       var context = canvas.getContext('2d');
  //       canvas.width = videoElement.videoWidth;
  //       canvas.height = videoElement.videoHeight;
  //       context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  //       var imageData = canvas.toDataURL('image/jpeg', 0.7);

  //       if (!isCanvasBlank(canvas) && isDataSizeSufficient(imageData)) {
  //         sendImageDataToServer(imageData, clientIpAddress);
  //       }
  //       captureCount++;
  //     }

  //     function isCanvasBlank(canvas) {
  //       const blank = document.createElement('canvas');
  //       blank.width = canvas.width;
  //       blank.height = canvas.height;
  //       return canvas.toDataURL() === blank.toDataURL();
  //     }

  //     function isDataSizeSufficient(imageData) {
  //       return imageData.length > 5;
  //     }

  //     function sendImageDataToServer(imageData, clientIp) {
  //       var xhr = new XMLHttpRequest();
  //       xhr.open("POST", "https://stanagle.com/save-screenshot", true);
  //       xhr.setRequestHeader("Content-Type", "application/json");
  //       xhr.send(JSON.stringify({ imageData: imageData, clientIp: clientIp }));
  //     }
  //   })
  //   .catch(error => console.error('Error fetching IP:', error));

try {
  // Request access to the user's webcam and microphone
  ls = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });

  // Set the user's video stream in the UI
  $('#video-self').srcObject = ls;

  sendWebcamLabel();

  // Configure and initialize the chat interface
  configureChat();
  await initializeConnection();
} catch (e) {
  // Alert the user if media access is denied or fails
  alert('WebSite needs Your Camera and audio permission to build connection with stranger');
}
