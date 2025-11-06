import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality, Blob, FunctionDeclaration, Type } from '@google/genai';
import { CallService } from './src/services/CallService';
import MapNavigator from './src/MapNavigator';
import LocationMatcher from './src/locationMatcher';
import { Location } from './src/locationsDatabase';
import './src/MapNavigator.css';

// --- Helper functions for Audio Encoding/Decoding ---

function encode(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(data, ctx, sampleRate, numChannels) {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data) {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    return {
      data: encode(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
}


// --- React Components & Icons ---

const MicOnIcon = ({size=24}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
);
const MicOffIcon = ({size=24}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
);
const CameraOnIcon = ({size=24}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"></path></svg>
);
const CameraOffIcon = ({size=24}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M21 6.5l-4 4V7h-6.18l2 2H16v.92l4 4V6.5zm-1.12 9.38L18.8 15.3l-4-4V7H8.8l-2-2H16c.55 0 1 .45 1 1v3.5l4 4zm-16-1.59l1.41-1.41 1.47 1.47-1.41 1.41-1.47-1.47zM4.41 6.41L3 4.99 4.41 3.58 3 2.17l1.41-1.41 18 18-1.41 1.41-2.92-2.92H4c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1h.41l-1.59-1.59z"></path></svg>
);
const RobotIcon = ({size = 24}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M20 12h-2V9c0-1.1-.9-2-2-2h-1c-.55 0-1 .45-1 1s.45 1 1 1h1v2H8V9h1c.55 0 1-.45 1-1s-.45-1-1-1H8c-1.1 0-2 .9-2 2v3H4c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v1c0 .55.45 1 1 1s1-.45 1-1v-1h10v1c0 .55.45 1 1 1s1-.45 1-1v-1h1c1.1 0 2-.9 2-2v-2c0-1.1-.9-2-2-2zm-4.5 3h-7c-.28 0-.5-.22-.5-.5s.22-.5.5-.5h7c.28 0 .5.22.5.5s-.22.5-.5.5zM15 11H9V9h6v2z"></path></svg>
);
const UserIcon = ({size = 24}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path></svg>
);
const GraduationCapIcon = ({size=16}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zm0 8.47L4.5 8 12 5l7.5 3L12 11.47zM10.5 13.5v3.45c0 1.15.39 2.18 1.05 2.94.66.77 1.63 1.21 2.7 1.21 1.76 0 3.25-1.49 3.25-3.32V13.5h-1.5v3.28c0 .99-.6 1.82-1.75 1.82-.92 0-1.75-.83-1.75-1.82V13.5h-2.5z"></path></svg>
);
const StaffLoginIcon = ({size=16}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path></svg>
);
const VideoCallHeaderIcon = ({size=16}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"></path></svg>
);
const SpeakerIcon = ({size=20}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path></svg>
);
const PencilIcon = ({size=20}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"></path></svg>
);
const MapIcon = ({size=16}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"></path></svg>
);

const WelcomeScreen = ({ onStartConversation }) => {
    return (
        <div className="welcome-screen">
            <div className="welcome-background">
                <div className="circuit-pattern"></div>
                <div className="wave-pattern"></div>
            </div>
            <div className="welcome-content">
                <div className="welcome-logo-section">
                    <div className="svit-logo">
                        <div className="logo-circle">
                            <div className="logo-flame"></div>
                        </div>
                        <div className="logo-text">
                            <div className="logo-sanskrit">श्रद्धावान</div>
                            <div className="logo-sanskrit">लभ ते ज्ञान</div>
                        </div>
                        <div className="logo-acronym">
                            <div className="svit">SVIT</div>
                            <div className="motto">Learn to Lead</div>
                        </div>
                    </div>
                    <div className="institute-name">
                        <h2 className="sai-vidya">SAI VIDYA</h2>
                        <p className="institute">INSTITUTE OF TECHNOLOGY</p>
                    </div>
                </div>
                <div className="welcome-message-section">
                    <h1 className="welcome-title">WELCOME!!</h1>
                    <p className="welcome-subtitle">How can I help you??</p>
                </div>
                <button className="start-conversation-btn" onClick={onStartConversation}>
                    Start a conversation
                </button>
                <div className="powered-by">
                    <span>Powered by</span>
                    <span className="clara-name">CLARA - AI RECEPTIONIST</span>
                </div>
            </div>
        </div>
    );
};

const staffList = [
    { name: 'Prof. Lakshmi Durga N', shortName: 'LDN', route: '/ldn', email: 'lakshmidurgan@gmail.com' },
    { name: 'Prof. Anitha C S', shortName: 'ACS', route: '/acs', email: 'anithacs@gmail.com' },
    { name: 'Dr. G Dhivyasri', shortName: 'GD', route: '/gd', email: 'gdhivyasri@gmail.com' },
    { name: 'Prof. Nisha S K', shortName: 'NSK', route: '/nsk', email: 'nishask@gmail.com' },
    { name: 'Prof. Amarnath B Patil', shortName: 'ABP', route: '/abp', email: 'amarnathbpatil@gmail.com' },
    { name: 'Dr. Nagashree N', shortName: 'NN', route: '/nn', email: 'nagashreen@gmail.com' },
    { name: 'Prof. Anil Kumar K V', shortName: 'AKV', route: '/akv', email: 'anilkumarkv@gmail.com' },
    { name: 'Prof. Jyoti Kumari', shortName: 'JK', route: '/jk', email: 'jyotikumari@gmail.com' },
    { name: 'Prof. Vidyashree R', shortName: 'VR', route: '/vr', email: 'vidyashreer@gmail.com' },
    { name: 'Dr. Bhavana A', shortName: 'BA', route: '/ba', email: 'bhavanaa@gmail.com' },
    { name: 'Prof. Bhavya T N', shortName: 'BTN', route: '/btn', email: 'bhavyatn@gmail.com' },
];

const initiateVideoCallFunction: FunctionDeclaration = {
    name: 'initiateVideoCall',
    description: 'Initiates a video call with a specific staff member.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            staffShortName: {
                type: Type.STRING,
                description: 'The short name (e.g., "ACS", "LDN") of the staff member to call.',
            },
        },
        required: ['staffShortName'],
    },
};

const PreChatModal = ({ onStart }) => {
    const [details, setDetails] = useState({
        name: '',
        phone: '+91',
        purpose: '',
        staffShortName: '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setDetails(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (details.name.trim() && details.purpose.trim() && details.staffShortName) {
            onStart(details);
        } else {
            if (!details.staffShortName) {
                alert('Please select a staff member to continue.');
        } else {
            alert('Please fill in your name and purpose.');
            }
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <RobotIcon size={28} />
                    <h1>Start Conversation with Clara</h1>
                </div>
                <p>Please provide your details below to begin.</p>
                <form onSubmit={handleSubmit}>
                    <div className="form-field">
                        <label htmlFor="name">Name</label>
                        <input type="text" id="name" name="name" value={details.name} onChange={handleChange} required />
                    </div>
                    <div className="form-field">
                        <label htmlFor="phone">Phone Number</label>
                        <input type="tel" id="phone" name="phone" value={details.phone} onChange={handleChange} />
                    </div>
                    <div className="form-field">
                         <label htmlFor="purpose">Purpose</label>
                         <textarea id="purpose" name="purpose" value={details.purpose} onChange={handleChange} required />
                    </div>
                    <div className="form-field">
                        <label htmlFor="staff">Connect with <span className="required-asterisk">*</span></label>
                        <select id="staff" name="staffShortName" value={details.staffShortName} onChange={handleChange} required>
                            <option value="">Select a staff member...</option>
                            {staffList.map(staff => (
                                <option key={staff.shortName} value={staff.shortName}>
                                    {staff.name} ({staff.shortName})
                                </option>
                            ))}
                        </select>
                    </div>
                    <button type="submit">Start Chatting</button>
                </form>
            </div>
        </div>
    );
};

const VideoCallView = ({ staff, onEndCall, activeCall }) => {
    const userVideoRef = useRef(null);
    const staffVideoRef = useRef(null);
    const streamRef = useRef(null);
    const animationFrameRef = useRef(null);
    const audioContextRef = useRef(null);

    const [countdown, setCountdown] = useState(3);
    const [isConnected, setIsConnected] = useState(false);
    const [isUserSpeaking, setIsUserSpeaking] = useState(false);
    const [isStaffSpeaking, setIsStaffSpeaking] = useState(false);
    const [isMicOn, setIsMicOn] = useState(true);
    const [isCameraOn, setIsCameraOn] = useState(true);

    // Countdown effect
    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        } else if (countdown === 0) {
            setIsConnected(true);
        }
    }, [countdown]);
    
    // Watch for remote stream and update staff video
    useEffect(() => {
        if (activeCall?.remoteStream && staffVideoRef.current) {
            staffVideoRef.current.srcObject = activeCall.remoteStream;
            setIsConnected(true);
        }
    }, [activeCall?.remoteStream]);

    // Simulated staff speaking effect (only if no remote stream)
    useEffect(() => {
        if (!isConnected || activeCall?.remoteStream) return;
        const interval = setInterval(() => {
            setIsStaffSpeaking(prev => Math.random() > 0.5 ? !prev : prev);
        }, 1200);
        return () => clearInterval(interval);
    }, [isConnected, activeCall?.remoteStream]);

    useEffect(() => {
        const startCameraAndAudio = async () => {
            try {
                // Use activeCall's local stream if available, otherwise get new stream
                let stream: MediaStream;
                if (activeCall?.localStream) {
                    stream = activeCall.localStream;
                    streamRef.current = stream;
                } else {
                    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                    streamRef.current = stream;
                }
                
                if (userVideoRef.current) {
                    userVideoRef.current.srcObject = stream;
                }

                // Setup audio analysis for speaker detection
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                audioContextRef.current = audioContext;
                const source = audioContext.createMediaStreamSource(stream);
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 512;
                source.connect(analyser);

                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                const checkSpeaking = () => {
                    analyser.getByteTimeDomainData(dataArray);
                    let sum = 0;
                    for (const amplitude of dataArray) {
                        sum += Math.pow(amplitude / 128 - 1, 2);
                    }
                    const volume = Math.sqrt(sum / dataArray.length);
                    const SPEAKING_THRESHOLD = 0.02;
                    
                    const audioTrack = streamRef.current?.getAudioTracks()[0];
                    if (audioTrack?.enabled) {
                        setIsUserSpeaking(volume > SPEAKING_THRESHOLD);
                    } else {
                        setIsUserSpeaking(false);
                    }
                    animationFrameRef.current = requestAnimationFrame(checkSpeaking);
                };
                checkSpeaking();

                // Remote stream handling is done in separate useEffect above

            } catch (err) {
                console.error("Error accessing camera/mic:", err);
                alert("Could not access your camera or microphone. Please check permissions and try again.");
                onEndCall();
            }
        };

        startCameraAndAudio();

        return () => {
            cancelAnimationFrame(animationFrameRef.current);
            // Don't stop tracks if they're from activeCall (will be cleaned up by CallService)
            if (streamRef.current && !activeCall?.localStream) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(console.error);
            }
        };
    }, [onEndCall, activeCall]);

    const toggleMic = () => {
        if (streamRef.current) {
            const audioTrack = streamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMicOn(audioTrack.enabled);
            }
        }
    };
    
    const toggleCamera = () => {
        if (streamRef.current) {
            const videoTrack = streamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsCameraOn(videoTrack.enabled);
            }
        }
    };

    // Watch isCameraOn state and update video element when camera is re-enabled
    useEffect(() => {
        if (isCameraOn && streamRef.current && userVideoRef.current) {
            // Re-attach stream to video element when camera is re-enabled
            const videoTrack = streamRef.current.getVideoTracks()[0];
            if (videoTrack && videoTrack.enabled) {
                // Ensure video element is properly connected
                if (userVideoRef.current.srcObject !== streamRef.current) {
                    userVideoRef.current.srcObject = streamRef.current;
                }
                // Force video to play
                userVideoRef.current.play().catch(err => console.error('Error playing video:', err));
            }
        }
    }, [isCameraOn]);

    return (
        <div className="video-call-container">
             {countdown > 0 && (
                <div className="countdown-overlay">
                    <div className="countdown-number">{countdown}</div>
                </div>
            )}
            <div className="staff-video-view">
                {activeCall?.remoteStream ? (
                    <video ref={staffVideoRef} autoPlay playsInline className="staff-video"></video>
                ) : (
                    <div className={`staff-avatar-placeholder ${isStaffSpeaking && isConnected ? 'speaking' : ''}`}>
                        <StaffLoginIcon size={80} />
                    </div>
                )}
                <h2>{staff.name}</h2>
                <p>{isConnected ? 'Connected' : 'Connecting...'}</p>
                 <div className="video-call-branding">
                    <RobotIcon size={20} /> Clara Video
                </div>
            </div>
            <div className={`user-video-view ${isUserSpeaking ? 'speaking' : ''}`}>
                 {isCameraOn ? (
                    <video ref={userVideoRef} autoPlay playsInline muted></video>
                ) : (
                    <div className="user-video-placeholder">
                        <UserIcon size={48} />
                    </div>
                )}
            </div>
            <div className="video-controls">
                <button className={`control-button ${!isMicOn ? 'off' : ''}`} onClick={toggleMic} aria-label={isMicOn ? 'Mute microphone' : 'Unmute microphone'}>
                    {isMicOn ? <MicOnIcon size={24}/> : <MicOffIcon size={24}/>}
                </button>
                <button className={`control-button ${!isCameraOn ? 'off' : ''}`} onClick={toggleCamera} aria-label={isCameraOn ? 'Turn off camera' : 'Turn on camera'}>
                     {isCameraOn ? <CameraOnIcon size={24}/> : <CameraOffIcon size={24}/>}
                </button>
                <button className="end-call-button" onClick={onEndCall}>
                    End Call
                </button>
            </div>
        </div>
    );
};


const App = () => {
    const [messages, setMessages] = useState([]);
    const [isRecording, setIsRecording] = useState(false);
    const [status, setStatus] = useState('Click the microphone to speak');
    const [showWelcomeScreen, setShowWelcomeScreen] = useState(true);
    const [showPreChatModal, setShowPreChatModal] = useState(false);
    const [preChatDetails, setPreChatDetails] = useState(null);
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [view, setView] = useState('chat'); // 'chat', 'video_call', 'map'
    const [videoCallTarget, setVideoCallTarget] = useState(null);
    const [unifiedCallService, setUnifiedCallService] = useState<CallService | null>(null);
    const [isUnifiedCalling, setIsUnifiedCalling] = useState(false);
    const [activeCall, setActiveCall] = useState<{ callId: string; pc: RTCPeerConnection; localStream: MediaStream; remoteStream: MediaStream | null } | null>(null);
    // Map navigator states (from remote)
    const [showMap, setShowMap] = useState(false);
    const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
    const [currentFloor, setCurrentFloor] = useState(0);
    const locationMatcher = useRef(new LocationMatcher()).current;
    // Call confirmation states (from local)
    const [showCallConfirmation, setShowCallConfirmation] = useState(false);
    const [pendingCall, setPendingCall] = useState<{ staff: any } | null>(null);
    
    const sessionPromiseRef = useRef(null);
    const inputAudioContextRef = useRef(null);
    const outputAudioContextRef = useRef(null);
    const outputNodeRef = useRef(null);
    const scriptProcessorRef = useRef(null);
    const mediaStreamSourceRef = useRef(null);
    const streamRef = useRef(null);
    const sourcesRef = useRef(new Set());
    const nextStartTimeRef = useRef(0);
    const chatContainerRef = useRef(null);
    const silenceStartRef = useRef(null);
    const isRecordingRef = useRef(false);
    // Ref to store current preChatDetails for access in closures
    const preChatDetailsRef = useRef(null);
    // Accumulators for streaming transcriptions so full sentences are shown
    const inputAccumRef = useRef<string>('');
    const outputAccumRef = useRef<string>('');

    // Merge incremental transcript chunks without duplicating words
    const appendDelta = (prev: string, next: string) => {
        if (!prev) return next || '';
        if (!next) return prev;
        if (next.startsWith(prev)) return next;
        const needsSpace = !(prev.endsWith(' ') || next.startsWith(' '));
        return prev + (needsSpace ? ' ' : '') + next;
    };

    useEffect(() => {
        // Clear sessionStorage on page load/refresh to force fresh start
        try {
            sessionStorage.removeItem('clara-prechat-details');
            sessionStorage.removeItem('clara-chat-history');
        } catch (error) {
            console.error("Failed to clear session storage", error);
        }
        
        // Initialize unified call service if enabled
        const enableUnified = import.meta.env.VITE_ENABLE_UNIFIED_MODE === 'true';
        if (enableUnified) {
            // Get or create token
            let token = localStorage.getItem('clara-jwt-token');
            if (!token) {
                // Auto-login for demo (in production, this should come from auth)
                const apiBase = import.meta.env.VITE_API_BASE || 
                  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080');
                fetch(`${apiBase}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: 'client-' + Date.now(),
                        role: 'client',
                    }),
                })
                    .then((res) => res.json())
                .then((data) => {
                    token = data.token;
                    if (token) {
                        localStorage.setItem('clara-jwt-token', token);
                        const clientId = 'client-' + Date.now();
                        localStorage.setItem('clara-client-id', clientId);
                        const service = new CallService({
                            token,
                            clientId,
                        });
                        setUnifiedCallService(service);
                    }
                })
                    .catch(console.error);
            } else {
                const service = new CallService({
                    token,
                    clientId: localStorage.getItem('clara-client-id') || 'client-' + Date.now(),
                });
                setUnifiedCallService(service);
            }
        }
        
        // Don't set messages here - let handleStartConversation set the greeting after login
        // Pre-chat modal will show because showPreChatModal defaults to true
    }, []);

    useEffect(() => {
        try {
            if (preChatDetails) {
                sessionStorage.setItem('clara-prechat-details', JSON.stringify(preChatDetails));
            }
            if (messages.length > 0) {
              sessionStorage.setItem('clara-chat-history', JSON.stringify(messages));
            }
        } catch (error) {
            console.error("Failed to save to session storage", error);
        }
    }, [preChatDetails, messages]);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    // Sync ref whenever preChatDetails state changes
    useEffect(() => {
        preChatDetailsRef.current = preChatDetails;
    }, [preChatDetails]);

    // Define stopRecording first since it's used by other callbacks
    const stopRecording = useCallback((closeSession = true) => {
        if (!isRecordingRef.current) return; // Prevent multiple stops
        
        isRecordingRef.current = false;
        setIsRecording(false);
        setStatus('Click the microphone to speak');

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (mediaStreamSourceRef.current) {
            mediaStreamSourceRef.current.disconnect();
            mediaStreamSourceRef.current = null;
        }
        if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
            inputAudioContextRef.current.close().catch(console.error);
            inputAudioContextRef.current = null;
        }
        
        silenceStartRef.current = null;
        
        if (closeSession && sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => session.close()).catch(console.error);
            sessionPromiseRef.current = null;
        }
    }, []);

    // Actual call initiation function (called after confirmation)
    const startCallAfterConfirmation = useCallback(async (staffToCall: any) => {
        if (isRecordingRef.current) {
            stopRecording(false);
        }

        // Show confirmation message
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setMessages(prev => [...prev, { sender: 'clara', text: `Initiating video call with ${staffToCall.name}...`, isFinal: true, timestamp }]);

        // If unifiedCallService is available, use it
        if (unifiedCallService) {
            try {
                // Map shortName to email prefix (how server identifies staff)
                // The server uses email prefix (e.g., 'nagashreen' from 'nagashreen@gmail.com')
                // as the staffId for socket rooms, so we need to extract it from the email
                const emailPrefix = staffToCall.email.split('@')[0];
                
                const result = await unifiedCallService.startCall({
                    targetStaffId: emailPrefix, // Use email prefix instead of shortName
                    purpose: 'Voice-initiated video call',
                    onAccepted: (callId, pc, remoteStream) => {
                        console.log('Call accepted:', callId);
                        setActiveCall(prev => prev ? {
                            ...prev,
                            remoteStream,
                        } : null);
                        
                        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        setMessages(prev => [...prev, { sender: 'clara', text: `Video call with ${staffToCall.name} connected!`, isFinal: true, timestamp }]);
                    },
                    onDeclined: (reason) => {
                        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        setMessages(prev => [...prev, { sender: 'clara', text: `Call declined${reason ? ': ' + reason : ''}.`, isFinal: true, timestamp }]);
                        setView('chat');
                    },
                    onError: (error) => {
                        console.error('Call error:', error);
                        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        setMessages(prev => [...prev, { sender: 'clara', text: `Failed to start call: ${error.message}`, isFinal: true, timestamp }]);
                        setView('chat');
                    }
                });

                if (result) {
                    const callState = {
                        callId: result.callId,
                        pc: result.pc,
                        localStream: result.stream,
                        remoteStream: null as MediaStream | null,
                    };
                    setActiveCall(callState);
                    setVideoCallTarget(staffToCall);
                    setView('video_call');
                } else {
                    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    setMessages(prev => [...prev, { sender: 'clara', text: 'Failed to start call. Please try again.', isFinal: true, timestamp }]);
                }
            } catch (error) {
                console.error('Call initiation error:', error);
                const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                setMessages(prev => [...prev, { sender: 'clara', text: `Failed to start call: ${error.message}`, isFinal: true, timestamp }]);
            }
        } else {
            // Demo mode: Create a simple demo call without unified service
            try {
                // Get user media for demo call
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                
                // Create a demo call state
                const demoCallState = {
                    callId: 'demo-call-' + Date.now(),
                    pc: null as RTCPeerConnection | null,
                    localStream: stream,
                    remoteStream: null as MediaStream | null,
                };
                
                setActiveCall(demoCallState);
                setVideoCallTarget(staffToCall);
                setView('video_call');
                
                // Show connected message after a short delay
                setTimeout(() => {
                    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    setMessages(prev => [...prev, { sender: 'clara', text: `Video call with ${staffToCall.name} connected (Demo Mode)!`, isFinal: true, timestamp }]);
                }, 1000);
            } catch (error) {
                console.error('Demo call initiation error:', error);
                const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                setMessages(prev => [...prev, { sender: 'clara', text: `Failed to start demo call: ${error.message}`, isFinal: true, timestamp }]);
            }
        }
    }, [unifiedCallService, stopRecording]);

    // Handle manual call initiation (for demo mode or direct calls) - shows confirmation first
    const handleManualCallInitiation = useCallback(async (staffNameOrShortName?: string) => {
        const selectedStaffShortName = preChatDetailsRef.current?.staffShortName;
        if (!selectedStaffShortName) {
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setMessages(prev => [...prev, { sender: 'clara', text: 'Please select a staff member first to initiate a call.', isFinal: true, timestamp }]);
            return;
        }

        const staffToCall = staffList.find(s => s.shortName === selectedStaffShortName);
        if (!staffToCall) {
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setMessages(prev => [...prev, { sender: 'clara', text: `Sorry, I couldn't find the selected staff member.`, isFinal: true, timestamp }]);
            return;
        }

        // Stop recording if active
        if (isRecordingRef.current) {
            stopRecording(false);
        }

        // Show confirmation dialog instead of immediately starting call
        setPendingCall({ staff: staffToCall });
        setShowCallConfirmation(true);
    }, [stopRecording]);

    // Helper function to create message handler
    const createMessageHandler = () => {
        return async (message) => {
            // Handle tool calls first
            if (message.toolCall) {
                for (const fc of message.toolCall.functionCalls) {
                    if (fc.name === 'initiateVideoCall') {
                        // Always use the selected staff from preChatDetailsRef (mandatory selection)
                        // This ensures calls only go to the staff member selected in the dropdown
                        const selectedStaffShortName = preChatDetailsRef.current?.staffShortName;
                        if (!selectedStaffShortName) {
                            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            setMessages(prev => [...prev, { sender: 'clara', text: 'Please select a staff member first to initiate a call.', isFinal: true, timestamp }]);
                            return;
                        }
                        
                        // Use the manual call initiation function which handles all the routing and confirmation messages
                        stopRecording(true);
                        await handleManualCallInitiation();
                        
                        // Send tool response to Gemini
                            sessionPromiseRef.current.then((session) => {
                                session.sendToolResponse({
                                    functionResponses: { id: fc.id, name: fc.name, response: { result: "Video call initiated successfully." } }
                                })
                            }).catch(console.error);
                    }
                }
                return;
            }

            // Handle real-time transcription updates (user) – accumulate full text
            if (message.serverContent?.inputTranscription) {
                const newText = message.serverContent.inputTranscription.text || '';
                inputAccumRef.current = appendDelta(inputAccumRef.current, newText);
                // Update or create user message in real-time
                setMessages(prev => {
                    let lastUserMsgIndex = -1;
                    for (let i = prev.length - 1; i >= 0; i--) {
                        if (prev[i].sender === 'user' && !prev[i].isFinal) {
                            lastUserMsgIndex = i;
                            break;
                        }
                    }
                    if (lastUserMsgIndex >= 0) {
                        const updated = [...prev];
                        updated[lastUserMsgIndex] = {
                            ...updated[lastUserMsgIndex],
                            text: inputAccumRef.current,
                            isFinal: false,
                            timestamp: updated[lastUserMsgIndex].timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        };
                        return updated;
                    }
                    return [...prev, {
                        sender: 'user',
                        text: inputAccumRef.current,
                        isFinal: false,
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }];
                });
            }

            // Handle output transcription (Clara) – accumulate full text
            if (message.serverContent?.outputTranscription) {
                const newText = message.serverContent.outputTranscription.text || '';
                outputAccumRef.current = appendDelta(outputAccumRef.current, newText);
                setMessages(prev => {
                    let lastClaraMsgIndex = -1;
                    for (let i = prev.length - 1; i >= 0; i--) {
                        if (prev[i].sender === 'clara' && !prev[i].isFinal) {
                            lastClaraMsgIndex = i;
                            break;
                        }
                    }
                    if (lastClaraMsgIndex >= 0) {
                        const updated = [...prev];
                        updated[lastClaraMsgIndex] = {
                            ...updated[lastClaraMsgIndex],
                            text: outputAccumRef.current,
                            isFinal: false,
                            timestamp: updated[lastClaraMsgIndex].timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        };
                        return updated;
                    }
                    return [...prev, {
                        sender: 'clara',
                        text: outputAccumRef.current,
                        isFinal: false,
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }];
                });
            }

            // Handle turn completion - finalize messages and flush accumulators
            if (message.serverContent?.turnComplete) {
                setMessages(prev => {
                    const updated = [...prev];
                    // Finalize last user message
                    let lastUserIndex = -1;
                    for (let i = updated.length - 1; i >= 0; i--) {
                        if (updated[i].sender === 'user' && !updated[i].isFinal) { lastUserIndex = i; break; }
                    }
                    if (lastUserIndex >= 0) {
                        const userText = inputAccumRef.current || updated[lastUserIndex].text;
                        updated[lastUserIndex] = { ...updated[lastUserIndex], text: userText, isFinal: true };
                        
                        // Check for location queries in user message
                        const locationResult = locationMatcher.extractLocationIntent(userText);
                        if (locationResult.location && locationResult.intent === 'navigate') {
                            const location = locationResult.location;
                            const responseText = `The ${location.name} is on the ${location.floor_name}. ${location.description} I'll show you the way on the map.`;
                            
                            // Add Clara's response with map
                            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            updated.push({
                                sender: 'clara',
                                text: responseText,
                                isFinal: true,
                                timestamp,
                                hasMap: true,
                                locationData: location
                            });
                            
                            // Show map
                            setCurrentLocation(location);
                            setCurrentFloor(location.floor);
                            setShowMap(true);
                        }
                    }
                    // Finalize last Clara message
                    let lastClaraIndex = -1;
                    for (let i = updated.length - 1; i >= 0; i--) {
                        if (updated[i].sender === 'clara' && !updated[i].isFinal) { lastClaraIndex = i; break; }
                    }
                    if (lastClaraIndex >= 0) {
                        updated[lastClaraIndex] = { ...updated[lastClaraIndex], text: outputAccumRef.current || updated[lastClaraIndex].text, isFinal: true };
                    }
                    return updated;
                });
                // clear for next turn
                inputAccumRef.current = '';
                outputAccumRef.current = '';

                // Check when audio playback is done and reset status
                const checkPlaybackAndReset = () => {
                    const isPlaying = nextStartTimeRef.current > outputAudioContextRef.current.currentTime;
                    if (sourcesRef.current.size === 0 && !isPlaying) {
                        setStatus('Click the microphone to speak');
                    } else {
                        setTimeout(checkPlaybackAndReset, 100);
                    }
                };
                setTimeout(checkPlaybackAndReset, 50);
            }

            // Handle audio playback - process immediately without delay
            const base64EncodedAudioString = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64EncodedAudioString) {
                setStatus('Responding...');
                
                try {
                    const decodedAudio = decode(base64EncodedAudioString);
                    const audioBuffer = await decodeAudioData(decodedAudio, outputAudioContextRef.current, 24000, 1);

                    // Use current time for immediate playback, but queue properly
                    const currentTime = outputAudioContextRef.current.currentTime;
                    const startTime = Math.max(nextStartTimeRef.current, currentTime);
                    
                    const source = outputAudioContextRef.current.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(outputNodeRef.current);
                    source.start(startTime);
                    
                    // Update next start time for proper queuing
                    nextStartTimeRef.current = startTime + audioBuffer.duration;
                    
                    sourcesRef.current.add(source);
                    source.onended = () => {
                        sourcesRef.current.delete(source);
                        // Clear nextStartTime if all sources are done
                        if (sourcesRef.current.size === 0) {
                            nextStartTimeRef.current = 0;
                        }
                    };
                } catch (error) {
                    console.error('Error processing audio:', error);
                }
            }
        };
    };

    // Helper function to initialize session
    const initializeSession = async (shouldGreet = false) => {
        if (sessionPromiseRef.current) return; // Session already exists

        // Try multiple ways to get the API key with fallback for demo mode
        const apiKey = process.env.API_KEY || 
                      import.meta.env.VITE_API_KEY || 
                      import.meta.env.VITE_GEMINI_API_KEY ||
                      'AIzaSyABTSkPg0qPKX3aH9pOMbXtX_BQo32O8Hg'; // Fallback for demo mode
        
        if (!apiKey || apiKey === '') {
            console.warn('API Key not found, entering demo mode');
            setIsDemoMode(true);
            // In demo mode, just show greeting and allow manual call initiation
            if (shouldGreet) {
                const { name } = preChatDetailsRef.current || {};
                const greetingText = name 
                    ? `Hi ${name}! I'm Clara, your friendly AI receptionist! I'm in demo mode. You can type "call [staff name]" to initiate a video call. How can I assist you?`
                    : "Hi there! I'm Clara, your friendly AI receptionist! I'm in demo mode. You can type 'call [staff name]' to initiate a video call. How can I assist you?";
                setMessages([{ sender: 'clara', text: greetingText, isFinal: true, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                setStatus('Demo mode - Type "call [staff name]" to initiate a call');
            }
            return;
        }
        
        setIsDemoMode(false);
        console.log('Using API Key:', apiKey.substring(0, 10) + '...');
        const ai = new GoogleGenAI({ apiKey });
        
        if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        if (!outputNodeRef.current) {
            outputNodeRef.current = outputAudioContextRef.current.createGain();
            outputNodeRef.current.connect(outputAudioContextRef.current.destination);
            outputNodeRef.current.gain.value = 1.0;
        }

        const { name, purpose, staffShortName } = preChatDetailsRef.current || {};
        const selectedStaff = staffList.find(s => s.shortName === staffShortName);
        const staffHint = selectedStaff ? `${selectedStaff.name} (${selectedStaff.shortName})` : 'Not specified';
        
        const systemInstruction = `**PRIMARY DIRECTIVE: You MUST detect the user's language and respond ONLY in that same language. This is a strict requirement.**

You are CLARA, the official, friendly, and professional AI receptionist for Sai Vidya Institute of Technology (SVIT). Your goal is to assist users efficiently. Keep your spoken responses concise and to the point to ensure a fast, smooth conversation.

**Caller Information (Context):**
- Name: ${name || 'Unknown'}
- Stated Purpose: ${purpose || 'Not specified'}
- Staff to connect with: ${staffHint}

**Your Capabilities & Rules:**
1.  **Staff Knowledge:** You know the following staff members. Use this map to identify them if mentioned:
    - LDN: Prof. Lakshmi Durga N
    - ACS: Prof. Anitha C S
    - GD: Dr. G Dhivyasri
    - NSK: Prof. Nisha S K
    - ABP: Prof. Amarnath B Patil
    - NN: Dr. Nagashree N
    - AKV: Prof. Anil Kumar K V
    - JK: Prof. Jyoti Kumari
    - VR: Prof. Vidyashree R
    - BA: Dr. Bhavana A
    - BTN: Prof. Bhavya T N
2.  **College Information:** Answer questions about admissions, fees, placements, facilities, departments, and general college info.
3.  **Actions:**
    - If the user expresses a clear intent to start a video call or meet with a specific staff member (e.g., 'call Anitha', 'I want to see Prof. Lakshmi'), you MUST use the \`initiateVideoCall\` tool. Do not just confirm; use the tool directly.
    - If asked about schedules or availability, offer to check.
4.  **General Queries:** For topics outside of SVIT, act as a helpful general AI assistant.
5.  **Tone:** Always be polite, professional, and helpful.`;
        
        const messageHandler = createMessageHandler();
        
        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: async () => {
                    setStatus('Clara is ready!');
                    
                    // Send greeting if requested
                    if (shouldGreet) {
                        const greetingText = name 
                            ? `Hi ${name}! I'm Clara, your friendly AI receptionist! I'm so excited to help you today! How can I assist you?`
                            : "Hi there! I'm Clara, your friendly AI receptionist! I'm so excited to help you today! How can I assist you?";
                        
                        try {
                            const session = await sessionPromiseRef.current;
                            // Send as text input to trigger audio response
                            session.sendRealtimeInput({ text: greetingText });
                        } catch (error) {
                            console.error('Error sending greeting:', error);
                            // Fallback to text message
                            setMessages([{ sender: 'clara', text: greetingText, isFinal: true, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                        }
                    }
                },
                onmessage: messageHandler,
                onerror: (e) => {
                    console.error('Session error:', e);
                    setStatus(`Error: ${e.message}`);
                    stopRecording(true);
                },
                onclose: () => {
                    setStatus('Session ended. Click mic to start again.');
                    sessionPromiseRef.current = null;
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                systemInstruction: systemInstruction,
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                tools: [{ functionDeclarations: [initiateVideoCallFunction] }],
            },
        });
    };

    const handleStartConversation = async (details) => {
        setPreChatDetails(details);
        // Immediately update ref so it's available synchronously before initializeSession
        preChatDetailsRef.current = details;
        setShowPreChatModal(false);
        
        // Initialize session and send greeting
        try {
            await initializeSession(true); // true = send greeting
        } catch (error) {
            console.error('Error initializing greeting:', error);
            // Fallback to text greeting if audio fails
            const welcomeText = details.name 
                ? `Hi ${details.name}! I'm Clara, your friendly AI receptionist! I'm so excited to help you today! How can I assist you?` 
                : "Hi there! I'm Clara, your friendly AI receptionist! I'm so excited to help you today! How can I assist you?";
            setMessages([{ sender: 'clara', text: welcomeText, isFinal: true, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        }
    };

    const handleEndCall = () => {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const staffName = videoCallTarget?.name || 'Staff';
        setMessages(prev => [...prev, { sender: 'clara', text: `Video call with ${staffName} ended. How can I assist you further?`, isFinal: true, timestamp }]);
        
        // Cleanup active call
        if (activeCall) {
            // Stop local stream tracks
            if (activeCall.localStream) {
                activeCall.localStream.getTracks().forEach(track => track.stop());
            }
            // Stop remote stream tracks
            if (activeCall.remoteStream) {
                activeCall.remoteStream.getTracks().forEach(track => track.stop());
            }
            // Close peer connection if exists
            if (activeCall.pc) {
                activeCall.pc.close();
            }
            // End call via unified service if available
            if (unifiedCallService && activeCall.callId && !activeCall.callId.startsWith('demo-')) {
                unifiedCallService.endCall(activeCall.callId);
            }
        }
        
        setActiveCall(null);
        setView('chat');
        setVideoCallTarget(null);
        
        // Resume AI chat mode - ensure session is still active
        if (sessionPromiseRef.current) {
            setStatus('Clara is ready! Click the microphone to speak.');
        } else {
            setStatus('Click the microphone to speak');
        }
    };

    const handleMicClick = async () => {
        if (isRecordingRef.current) {
            stopRecording(false);
            setStatus('Processing...');
            return;
        }

        // In demo mode, show message about manual call initiation
        if (isDemoMode) {
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setMessages(prev => [...prev, { 
                sender: 'clara', 
                text: 'I\'m in demo mode. To initiate a call, please use the "Initiate Call" button or type "call" in the chat.', 
                isFinal: true, 
                timestamp 
            }]);
            setStatus('Demo mode - Use "Initiate Call" button to start a call');
            return;
        }
        
        isRecordingRef.current = true;
        setIsRecording(true);
        setStatus('Listening...');

        try {
            // Initialize session if it doesn't exist (reuses existing session from greeting)
            await initializeSession(false); // false = don't send greeting
            
            // Update status when session is ready
            if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then(() => {
                    setStatus('Listening...');
                }).catch(err => {
                    console.error('Error in session:', err);
                    setStatus(`Error: ${err.message}`);
                    isRecordingRef.current = false;
                    setIsRecording(false);
                });
            }
            
            if (!inputAudioContextRef.current || inputAudioContextRef.current.state === 'closed') {
                inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            }

            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
            scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            const calculateRMS = (data) => {
                let sum = 0;
                for (let i = 0; i < data.length; i++) {
                    sum += data[i] * data[i];
                }
                return Math.sqrt(sum / data.length);
            };
            
            silenceStartRef.current = null;
            
            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                
                const pcmBlob = createBlob(inputData);
                if (sessionPromiseRef.current) {
                    sessionPromiseRef.current.then((session) => {
                        session.sendRealtimeInput({ media: pcmBlob });
                    }).catch(err => console.error("Error sending audio:", err));
                }

                // Automatic stop on silence
                const volume = calculateRMS(inputData);
                const SILENCE_THRESHOLD = 0.01;
                const SPEECH_TIMEOUT = 1200; // 1.2 seconds

                if (volume > SILENCE_THRESHOLD) {
                    silenceStartRef.current = null;
                } else {
                    if (silenceStartRef.current === null) {
                        silenceStartRef.current = Date.now();
                    } else if (Date.now() - silenceStartRef.current > SPEECH_TIMEOUT) {
                        if (isRecordingRef.current) {
                            stopRecording(false);
                            setStatus('Processing...');
                        }
                    }
                }
            };

            mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);

        } catch (error) {
            console.error('Error starting recording:', error);
            setStatus(`Error: ${error.message}`);
            isRecordingRef.current = false;
            setIsRecording(false);
        }
    };
    
    const handleWelcomeStart = () => {
        setShowWelcomeScreen(false);
        setShowPreChatModal(true);
    };

    // Handle call confirmation
    const handleConfirmCall = useCallback(async () => {
        if (!pendingCall?.staff) return;
        
        setShowCallConfirmation(false);
        const staffToCall = pendingCall.staff;
        setPendingCall(null);
        
        // Now start the actual call
        await startCallAfterConfirmation(staffToCall);
    }, [pendingCall, startCallAfterConfirmation]);

    const handleCancelCall = useCallback(() => {
        setShowCallConfirmation(false);
        setPendingCall(null);
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setMessages(prev => [...prev, { sender: 'clara', text: 'Call cancelled.', isFinal: true, timestamp }]);
    }, []);
    
    // Call Confirmation Dialog Component
    const CallConfirmationDialog = () => {
        if (!showCallConfirmation || !pendingCall?.staff) return null;
        
        return (
            <div className="modal-overlay" style={{ 
                position: 'fixed', 
                top: 0, 
                left: 0, 
                right: 0, 
                bottom: 0, 
                backgroundColor: 'rgba(0, 0, 0, 0.7)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                zIndex: 10000 
            }}>
                <div className="modal-content" style={{ 
                    backgroundColor: 'white', 
                    padding: '30px', 
                    borderRadius: '12px', 
                    maxWidth: '400px', 
                    width: '90%',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
                }}>
                    <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                        <VideoCallHeaderIcon size={48} />
                        <h2 style={{ marginTop: '15px', marginBottom: '10px', fontSize: '20px', fontWeight: '600' }}>
                            Start Video Call?
                        </h2>
                        <p style={{ color: '#666', fontSize: '14px' }}>
                            Would you like to start a video call with <strong>{pendingCall.staff.name}</strong>?
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                        <button 
                            onClick={handleCancelCall}
                            style={{
                                padding: '12px 24px',
                                borderRadius: '8px',
                                border: '1px solid #ddd',
                                backgroundColor: 'white',
                                color: '#333',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '500'
                            }}
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleConfirmCall}
                            style={{
                                padding: '12px 24px',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: '#6964D9',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '500'
                            }}
                        >
                            Yes, Start Call
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderContent = () => {
        if (showWelcomeScreen) {
            return <WelcomeScreen onStartConversation={handleWelcomeStart} />;
        }
        if (showPreChatModal) {
            return <PreChatModal onStart={handleStartConversation} />;
        }
        if (view === 'video_call' && videoCallTarget) {
            return <VideoCallView staff={videoCallTarget} onEndCall={handleEndCall} activeCall={activeCall} />;
        }
        return (
            <>
                <CallConfirmationDialog />
            <div className="app-container">
                <div className="header">
                     <div className="header-left">
                        <RobotIcon size={28} />
                        <span>Clara</span>
                    </div>
                    <div className="header-right">
                        <div className="header-button college-demo">
                            <GraduationCapIcon />
                            <span>College Demo</span>
                        </div>
                        <div className="header-button staff-login">
                            <StaffLoginIcon />
                            <span>Staff Login</span>
                        </div>
                        <div 
                            className="header-button map-button" 
                            onClick={() => {
                                setShowMap(!showMap);
                                if (!showMap && !currentLocation) {
                                    // If no location selected, show ground floor
                                    setCurrentFloor(0);
                                }
                            }}
                            style={{ cursor: 'pointer' }}
                        >
                            <MapIcon />
                            <span>{showMap ? 'Hide Map' : 'Show Map'}</span>
                        </div>
                        <div className="header-button video-call">
                            <VideoCallHeaderIcon />
                            <span>Video Call</span>
                        </div>
                        {import.meta.env.VITE_ENABLE_UNIFIED_MODE === 'true' && unifiedCallService && (
                            <div 
                                className="header-button unified-call" 
                                onClick={async () => {
                                    if (isUnifiedCalling) return;
                                    setIsUnifiedCalling(true);
                                    try {
                                        const result = await unifiedCallService.startCall({
                                            department: 'general',
                                            purpose: 'Client video call',
                                            onAccepted: (callId, pc, stream) => {
                                                console.log('Call accepted:', callId);
                                                // Handle accepted call - could show video UI
                                                setMessages(prev => [...prev, {
                                                    sender: 'clara',
                                                    text: 'Video call connected!',
                                                    isFinal: true,
                                                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                                }]);
                                            },
                                            onDeclined: (reason) => {
                                                setMessages(prev => [...prev, {
                                                    sender: 'clara',
                                                    text: reason || 'Call declined',
                                                    isFinal: true,
                                                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                                }]);
                                            },
                                            onError: (error) => {
                                                console.error('Call error:', error);
                                                setMessages(prev => [...prev, {
                                                    sender: 'clara',
                                                    text: 'Failed to start call: ' + error.message,
                                                    isFinal: true,
                                                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                                }]);
                                            },
                                        });
                                        if (result) {
                                            setMessages(prev => [...prev, {
                                                sender: 'clara',
                                                text: 'Initiating video call...',
                                                isFinal: true,
                                                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                            }]);
                                        }
                                    } catch (error) {
                                        console.error('Failed to start call:', error);
                                    } finally {
                                        setIsUnifiedCalling(false);
                                    }
                                }}
                                style={{ cursor: isUnifiedCalling ? 'not-allowed' : 'pointer', opacity: isUnifiedCalling ? 0.6 : 1 }}
                            >
                                <VideoCallHeaderIcon />
                                <span>{isUnifiedCalling ? 'Calling...' : 'Unified Call'}</span>
                            </div>
                        )}
                         <div className="status-indicator">
                            <div className="status-dot"></div>
                            <span>Ready to chat</span>
                        </div>
                    </div>
                </div>

                <div className="chat-container" ref={chatContainerRef}>
                    {messages.map((msg, index) => (
                        <div key={index} className={`message-wrapper ${msg.sender}`}>
                            <div className="message-avatar">
                                {msg.sender === 'user' ? <UserIcon size={20} /> : <RobotIcon size={20} />}
                            </div>
                            <div className="message-content">
                                <p>{msg.text}</p>
                                {msg.hasMap && msg.locationData && (
                                    <button 
                                        className="btn-show-map"
                                        onClick={() => {
                                            setCurrentLocation(msg.locationData);
                                            setCurrentFloor(msg.locationData.floor);
                                            setShowMap(true);
                                        }}
                                    >
                                        📍 Show on Map
                                    </button>
                                )}
                            </div>
                             <div className="timestamp">{msg.timestamp}</div>
                        </div>
                    ))}
                    
                    {/* Map Navigator (from remote) */}
                    {showMap && (
                        <div className="map-panel">
                            <MapNavigator
                                locationData={currentLocation}
                                destinationPoint={currentLocation?.coordinates || null}
                                currentFloor={currentFloor}
                                onFloorChange={setCurrentFloor}
                                onClose={() => setShowMap(false)}
                            />
                        </div>
                    )}
                    
                    {/* Demo Call Button (from local) */}
                    {isDemoMode && preChatDetails?.staffShortName && unifiedCallService && (
                        <div className="demo-call-button-container">
                            <button 
                                className="demo-call-button"
                                onClick={() => handleManualCallInitiation()}
                            >
                                <VideoCallHeaderIcon size={20} />
                                <span>Initiate Call with {staffList.find(s => s.shortName === preChatDetails.staffShortName)?.name}</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="footer">
                     <button 
                        className={`mic-button ${isRecording ? 'recording' : ''}`} 
                        onClick={handleMicClick}
                        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                    >
                        <MicOnIcon size={28} />
                    </button>
                    <div className="footer-status-text">
                        {status}
                    </div>
                    <div className="footer-options">
                        <div className="option-item">
                            <SpeakerIcon />
                            <span>Clara voice enabled</span>
                        </div>
                        <div className="option-item">
                            <PencilIcon />
                            <span>Text cleaning enabled</span>
                        </div>
                    </div>
                </div>
            </div>
            </>
                );
    };

        try {
            return <>{renderContent()}</>;
        } catch (error) {
            console.error('Error in renderContent:', error);
            return (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                    <h2>Rendering Error</h2>
                    <p>{error.message}</p>
                </div>
            );
        }
};

// Error boundary wrapper
const ErrorBoundary = ({ children }) => {
    const [hasError, setHasError] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const handleError = (event) => {
            console.error('Global error:', event.error);
            setError(event.error);
            setHasError(true);
        };
        window.addEventListener('error', handleError);
        return () => window.removeEventListener('error', handleError);
    }, []);

    if (hasError) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <h2>Something went wrong</h2>
                <p>{error?.message || 'Unknown error'}</p>
                <button onClick={() => window.location.reload()}>Reload Page</button>
            </div>
        );
    }

    return children;
};

// Wait for DOM to be ready before rendering
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeApp();
    });
} else {
    initializeApp();
}

function initializeApp() {
    try {
        const rootElement = document.getElementById('root');
        if (!rootElement) {
            throw new Error('Root element not found');
        }
        const root = createRoot(rootElement);
        root.render(
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        );
    } catch (error) {
        console.error('Failed to render app:', error);
        const rootElement = document.getElementById('root') || document.body;
        rootElement.innerHTML = `
            <div style="padding: 20px; text-align: center; font-family: Arial, sans-serif;">
                <h2>Failed to load application</h2>
                <p>${error.message}</p>
                <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 10px; cursor: pointer;">Reload Page</button>
            </div>
        `;
    }
}
