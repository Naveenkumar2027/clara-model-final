import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality, Blob, FunctionDeclaration, Type } from '@google/genai';
import { CallService } from './src/services/CallService';
import MapNavigator from './src/MapNavigator';
import LocationMatcher from './src/locationMatcher';
import { Location } from './src/locationsDatabase';
import WebRTCVideoCall from './src/components/WebRTCVideoCall';
import { useCallStore } from './src/stores/callStore';
import DevicePermissionPrompt from './src/components/DevicePermissionPrompt';
import CallRoom from './src/components/CallRoom';
import CallToast, { ToastType } from './src/components/CallToast';
import CallEndSummary from './src/components/CallEndSummary';
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

const SVITLogo = () => {
    return (
        <svg className="svit-logo-image" viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="sunGradient" cx="50%" cy="35%">
                    <stop offset="0%" style={{stopColor:"#ffeb3b", stopOpacity:1}} />
                    <stop offset="100%" style={{stopColor:"#ff9800", stopOpacity:1}} />
                </radialGradient>
                <linearGradient id="flameGradient" x1="50%" y1="0%" x2="50%" y2="100%">
                    <stop offset="0%" style={{stopColor:"#ff4444", stopOpacity:1}} />
                    <stop offset="50%" style={{stopColor:"#ff0000", stopOpacity:1}} />
                    <stop offset="100%" style={{stopColor:"#cc0000", stopOpacity:1}} />
                </linearGradient>
            </defs>
            
            {/* Outer circle borders */}
            <circle cx="100" cy="100" r="95" fill="none" stroke="#dc2626" strokeWidth="2"/>
            <circle cx="100" cy="100" r="88" fill="none" stroke="#ffffff" strokeWidth="3"/>
            <circle cx="100" cy="100" r="82" fill="none" stroke="#dc2626" strokeWidth="2"/>
            
            {/* Inner circle with gradient background */}
            <circle cx="100" cy="100" r="78" fill="url(#sunGradient)"/>
            
            {/* Sun rays */}
            {Array.from({length: 20}, (_, i) => {
                const angle = (i * 360 / 20) * Math.PI / 180;
                const x1 = 100 + Math.cos(angle) * 75;
                const y1 = 100 + Math.sin(angle) * 75;
                const x2 = 100 + Math.cos(angle) * 82;
                const y2 = 100 + Math.sin(angle) * 82;
                return (
                    <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ff9800" strokeWidth="1.5" opacity="0.7"/>
                );
            })}
            
            {/* Book at bottom */}
            <rect x="75" y="140" width="50" height="38" fill="#2c2c2c" rx="3"/>
            <rect x="80" y="145" width="40" height="28" fill="#ffffff" rx="1"/>
            <line x1="100" y1="145" x2="100" y2="173" stroke="#2c2c2c" strokeWidth="1.5"/>
            <line x1="85" y1="152" x2="115" y2="152" stroke="#e0e0e0" strokeWidth="0.5"/>
            <line x1="85" y1="158" x2="115" y2="158" stroke="#e0e0e0" strokeWidth="0.5"/>
            <line x1="85" y1="164" x2="115" y2="164" stroke="#e0e0e0" strokeWidth="0.5"/>
            
            {/* Flame rising from book */}
            <path d="M 95 140 Q 90 115, 100 105 Q 110 115, 105 140 Z" fill="url(#flameGradient)" stroke="#ff6600" strokeWidth="1"/>
            <ellipse cx="100" cy="110" rx="4" ry="10" fill="#ffffff" opacity="0.6"/>
            
            {/* Text on circle ring - SAI VIDYA INSTITUTE */}
            <text x="100" y="25" textAnchor="middle" fontSize="9" fill="#333" fontFamily="Arial, sans-serif" fontWeight="bold">SAI VIDYA INSTITUTE</text>
            <text x="100" y="38" textAnchor="middle" fontSize="8" fill="#333" fontFamily="Arial, sans-serif">OF TECHNOLOGY</text>
        </svg>
    );
};

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
                        <img 
                            src="/assets/svit-logo.png" 
                            alt="SVIT Logo" 
                            className="svit-logo-image"
                        />
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
                <button 
                    className="start-conversation-btn" 
                    onClick={onStartConversation}
                    data-testid="start-conversation-button"
                    aria-label="Start a conversation with Clara"
                >
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

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[PreChat] Form submit attempted', { details });
        
        if (details.name.trim() && details.purpose.trim() && details.staffShortName) {
            console.log('[PreChat] Form valid, starting conversation');
            onStart(details);
        } else {
            if (!details.staffShortName) {
                console.warn('[PreChat] Staff member not selected');
                alert('Please select a staff member to continue.');
            } else {
                console.warn('[PreChat] Name or purpose missing');
                alert('Please fill in your name and purpose.');
            }
        }
    }, [details, onStart]);

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <RobotIcon size={28} />
                    <h1>Start Conversation with Clara</h1>
                </div>
                <p>Please provide your details below to begin.</p>
                <form onSubmit={handleSubmit} data-testid="prechat-form">
                    <div className="form-field">
                        <label htmlFor="name">Name</label>
                        <input 
                            type="text" 
                            id="name" 
                            name="name" 
                            value={details.name} 
                            onChange={handleChange} 
                            required 
                            data-testid="name-input"
                            aria-label="Your name"
                        />
                    </div>
                    <div className="form-field">
                        <label htmlFor="phone">Phone Number</label>
                        <input 
                            type="tel" 
                            id="phone" 
                            name="phone" 
                            value={details.phone} 
                            onChange={handleChange}
                            data-testid="phone-input"
                            aria-label="Phone number"
                        />
                    </div>
                    <div className="form-field">
                         <label htmlFor="purpose">Purpose</label>
                         <textarea 
                            id="purpose" 
                            name="purpose" 
                            value={details.purpose} 
                            onChange={handleChange} 
                            required
                            data-testid="purpose-input"
                            aria-label="Purpose of conversation"
                         />
                    </div>
                    <div className="form-field">
                        <label htmlFor="staff">Connect with <span className="required-asterisk">*</span></label>
                        <select 
                            id="staff" 
                            name="staffShortName" 
                            value={details.staffShortName} 
                            onChange={handleChange} 
                            required
                            data-testid="staff-select"
                            aria-label="Select staff member"
                        >
                            <option value="">Select a staff member...</option>
                            {staffList.map(staff => (
                                <option key={staff.shortName} value={staff.shortName}>
                                    {staff.name} ({staff.shortName})
                                </option>
                            ))}
                        </select>
                    </div>
                    <button 
                        type="submit" 
                        data-testid="start-chatting-button"
                        aria-label="Start chatting with Clara"
                        style={{
                            width: '100%',
                            padding: '12px',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            backgroundColor: '#4CAF50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            marginTop: '10px'
                        }}
                        onMouseOver={(e) => {
                            (e.target as HTMLButtonElement).style.backgroundColor = '#45a049';
                        }}
                        onMouseOut={(e) => {
                            (e.target as HTMLButtonElement).style.backgroundColor = '#4CAF50';
                        }}
                    >
                        Start Chatting
                    </button>
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
                // If pc and localStream are null, we're in "ringing" state - don't access camera yet
                if (!activeCall?.pc || !activeCall?.localStream) {
                    // Show "Ringing..." state
                    setIsConnected(false);
                    return;
                }
                
                // Use activeCall's local stream
                const stream = activeCall.localStream;
                streamRef.current = stream;
                
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
                ) : activeCall?.pc && activeCall?.localStream ? (
                    <div className={`staff-avatar-placeholder ${isStaffSpeaking && isConnected ? 'speaking' : ''}`}>
                        <StaffLoginIcon size={80} />
                    </div>
                ) : (
                    <div className="staff-avatar-placeholder ringing">
                        <StaffLoginIcon size={80} />
                        <div className="ringing-indicator">
                            <div className="ringing-dot"></div>
                            <div className="ringing-dot"></div>
                            <div className="ringing-dot"></div>
                        </div>
                    </div>
                )}
                <h2>{staff.name}</h2>
                <p>
                    {activeCall?.remoteStream ? 'Connected' : 
                     activeCall?.pc && activeCall?.localStream ? 'Connecting...' : 
                     'Ringing...'}
                </p>
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
    const [textInput, setTextInput] = useState(''); // Text input for fallback when microphone unavailable
    const [showTextInput, setShowTextInput] = useState(false); // Show text input when mic unavailable
    const [callStatus, setCallStatus] = useState<{ callId?: string; roomName?: string; status?: string } | null>(null); // Call status for UI display
    const [isCollegeQueryActive, setIsCollegeQueryActive] = useState(false); // Track if current query is college-related
    const isCollegeQueryActiveRef = useRef(false); // Immediate ref for race condition prevention
    const [view, setView] = useState('chat'); // 'chat', 'video_call', 'map'
    const [videoCallTarget, setVideoCallTarget] = useState(null);
    const [unifiedCallService, setUnifiedCallService] = useState<CallService | null>(null);
    const [isUnifiedCalling, setIsUnifiedCalling] = useState(false);
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [detectedLanguage, setDetectedLanguage] = useState<string>('en'); // Default to English
    // Ref to store detected language for immediate access during response generation
    const detectedLanguageRef = useRef<string>('en');
    const [activeCall, setActiveCall] = useState<{ 
        callId: string; 
        roomName: string;
        pc?: RTCPeerConnection;
        stream?: MediaStream;
        remoteStream?: MediaStream | null;
    } | null>(null);
    
    // New call store integration
    const callStore = useCallStore();
    const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
    const [pendingCallStaff, setPendingCallStaff] = useState<any>(null);
    const [toast, setToast] = useState<{ type: ToastType; message?: string } | null>(null);
    const [showEndSummary, setShowEndSummary] = useState(false);
    
    // Sync callStore with activeCall for backward compatibility
    useEffect(() => {
        if (activeCall && callStore.state === 'idle') {
            callStore.setDialing(activeCall.callId);
        }
    }, [activeCall]);
    
    // Debug: Log view changes (moved after all state declarations)
    useEffect(() => {
        console.log('[Client] View changed to:', view);
        console.log('[Client] activeCall:', activeCall);
        console.log('[Client] videoCallTarget:', videoCallTarget);
    }, [view, activeCall, videoCallTarget]);
    // Map navigator states (from remote)
    const [showMap, setShowMap] = useState(false);
    const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
    const [currentFloor, setCurrentFloor] = useState(0);
    const locationMatcher = useRef(new LocationMatcher()).current;
    
    const sessionPromiseRef = useRef<any | null>(null);
    const liveSessionRef = useRef<any | null>(null);
    const sessionStateRef = useRef<'idle' | 'connecting' | 'open' | 'closing' | 'closed'>('idle');
    const inputAudioContextRef = useRef(null);
    const outputAudioContextRef = useRef(null);
    const outputNodeRef = useRef(null);
    const scriptProcessorRef = useRef(null);
    const analyserRef = useRef(null);
    const mediaStreamSourceRef = useRef(null);
    const streamRef = useRef(null);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const nextStartTimeRef = useRef(0);
    const chatContainerRef = useRef(null);
    const silenceStartRef = useRef(null);
    const isRecordingRef = useRef(false);
    const lastEndedCallIdRef = useRef<string | null>(null);
    // Ref to store current preChatDetails for access in closures
    const preChatDetailsRef = useRef(null);
    // Ref to store login user name for immediate access during greeting
    const loginUserNameRef = useRef<string>('');
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
        
        // Load TTS voices
        if ('speechSynthesis' in window) {
            // Chrome needs voices to be loaded
            const loadVoices = () => {
                window.speechSynthesis.getVoices();
            };
            loadVoices();
            if (window.speechSynthesis.onvoiceschanged !== undefined) {
                window.speechSynthesis.onvoiceschanged = loadVoices;
            }
        }
        
        // ALWAYS initialize unified call service for WebRTC calls
        // This enables video calls via sockets regardless of AI mode
        const enableUnified = import.meta.env.VITE_ENABLE_UNIFIED_MODE === 'true' || true; // Force enable for presentation
        console.log('[App] Initializing unified call service, enableUnified:', enableUnified);
        
        if (enableUnified) {
            // Get or create token
            let token = localStorage.getItem('clara-jwt-token');
            const clientId = localStorage.getItem('clara-client-id') || 'client-' + Date.now();
            localStorage.setItem('clara-client-id', clientId); // Always store clientId
            
            // Helper function to login with retry logic
            const loginWithRetry = async (retries = 3, delay = 1000): Promise<void> => {
                const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:8080';
                console.log('[App] Initializing/refreshing token...');
                console.log('[App] Using API base:', apiBase);
                
                for (let attempt = 0; attempt < retries; attempt++) {
                    try {
                        const headers: HeadersInit = { 'Content-Type': 'application/json' };
                        // Add test mode header if in test environment
                        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                            headers['x-test-mode'] = 'true';
                        }
                        
                        const response = await fetch(`${apiBase}/api/auth/login`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({
                                username: clientId,
                                role: 'client',
                            }),
                        });
                        
                        if (response.status === 429) {
                            // Rate limited - wait and retry
                            const waitTime = delay * Math.pow(2, attempt);
                            console.warn(`[App] Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${retries}...`);
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                            continue;
                        }
                        
                        if (!response.ok) {
                            throw new Error(`Login failed: ${response.statusText}`);
                        }
                        
                        const data = await response.json();
                        token = data.token;
                        if (token) {
                            localStorage.setItem('clara-jwt-token', token);
                            localStorage.setItem('clara-token-timestamp', Date.now().toString());
                            const service = new CallService({
                                token,
                                clientId,
                            });
                            setUnifiedCallService(service);
                            console.log('[App] CallService initialized with fresh token, clientId:', clientId);
                            return;
                        } else {
                            console.error('[App] No token received from login');
                        }
                    } catch (error: any) {
                        console.error(`[App] Login attempt ${attempt + 1} failed:`, error);
                        if (attempt < retries - 1) {
                            const waitTime = delay * Math.pow(2, attempt);
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                        } else {
                            // Last attempt failed, use existing token if available
                            if (token) {
                                const service = new CallService({
                                    token,
                                    clientId,
                                });
                                setUnifiedCallService(service);
                                console.log('[App] CallService initialized with existing token (may be expired), clientId:', clientId);
                            }
                        }
                    }
                }
            };
            
            // Only login if token doesn't exist or is about to expire
            // JWT tokens typically expire in 15 minutes, so refresh if older than 10 minutes
            const tokenAge = localStorage.getItem('clara-token-timestamp');
            const now = Date.now();
            const shouldRefresh = !token || !tokenAge || (now - parseInt(tokenAge)) > 10 * 60 * 1000;
            
            if (shouldRefresh) {
                loginWithRetry().catch(error => {
                    console.error('[App] Failed to login after retries:', error);
                });
            } else {
                // Use existing token
                if (token) {
                    const service = new CallService({
                        token,
                        clientId,
                    });
                    setUnifiedCallService(service);
                    console.log('[App] CallService initialized with existing token, clientId:', clientId);
                }
            }
        } else {
            console.warn('[App] Unified mode is disabled - video calls will not work');
        }
        
        // Don't set messages here - let handleStartConversation set the greeting after login
        // Pre-chat modal will show because showPreChatModal defaults to true
    }, []);
    
    // Expose tokens and call status in window object for testing (updates on changes)
    useEffect(() => {
        const updateTestData = () => {
            try {
                const token = localStorage.getItem('clara-jwt-token');
                const clientId = localStorage.getItem('clara-client-id');
                const refreshToken = localStorage.getItem('clara-refresh-token');
                const callId = callStatus?.callId || activeCall?.callId;
                
                // Comprehensive test data object
                (window as any).__CLARA_TEST_DATA__ = {
                    token,
                    refreshToken,
                    clientId,
                    callStatus,
                    activeCall,
                    callId,
                    getCallStatus: () => callStatus,
                    getActiveCall: () => activeCall,
                    getCallId: () => callId,
                    getToken: () => token,
                    getRefreshToken: () => refreshToken,
                    getClientId: () => clientId,
                };
                
                // Also expose directly for easier access
                (window as any).__CLARA_TOKEN__ = token;
                (window as any).__CLARA_REFRESH_TOKEN__ = refreshToken;
                (window as any).__CLARA_CLIENT_ID__ = clientId;
                (window as any).__CLARA_CALL_ID__ = callId;
                (window as any).__CLARA_CALL_STATUS__ = callStatus;
                
                // Expose localStorage access for tests
                (window as any).__CLARA_GET_STORAGE__ = (key: string) => {
                    try {
                        return localStorage.getItem(key);
                    } catch (e) {
                        return null;
                    }
                };
                
                // Expose API helper for tests
                (window as any).__CLARA_API_CALL__ = async (url: string, options: any = {}) => {
                    const headers = {
                        'Content-Type': 'application/json',
                        'x-test-mode': 'true',
                        ...(token && { 'Authorization': `Bearer ${token}` }),
                        ...(options.headers || {}),
                    };
                    return fetch(url, { ...options, headers });
                };
            } catch (error) {
                console.error('Error exposing test data:', error);
            }
        };
        
        updateTestData();
        
        // Update test data periodically to catch token changes
        const interval = setInterval(updateTestData, 1000);
        return () => clearInterval(interval);
    }, [callStatus, activeCall]);

    // Sync detectedLanguageRef with detectedLanguage state
    useEffect(() => {
        detectedLanguageRef.current = detectedLanguage;
    }, [detectedLanguage]);
    
    // Pre-initialize audio contexts to eliminate delay at conversation start
    useEffect(() => {
        // Pre-initialize output audio context
        if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
            try {
                outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                console.log('[Audio] Pre-initialized output audio context');
                
                // Pre-resume audio context after user interaction (browser autoplay policy)
                const resumeOnInteraction = async () => {
                    if (outputAudioContextRef.current && outputAudioContextRef.current.state === 'suspended') {
                        try {
                            await outputAudioContextRef.current.resume();
                            console.log('[Audio] Pre-resumed output audio context');
                        } catch (error) {
                            console.warn('[Audio] Failed to pre-resume output audio context:', error);
                        }
                    }
                };
                
                // Try to resume on any user interaction
                const events = ['click', 'touchstart', 'keydown'];
                const handlers = events.map(event => {
                    const handler = () => {
                        resumeOnInteraction();
                        events.forEach(e => document.removeEventListener(e, handlers[events.indexOf(e)]));
                    };
                    document.addEventListener(event, handler, { once: true });
                    return handler;
                });
            } catch (error) {
                console.warn('[Audio] Failed to pre-initialize output audio context:', error);
            }
        }
        
        // Pre-initialize output node if context exists
        if (outputAudioContextRef.current && !outputNodeRef.current) {
            try {
                outputNodeRef.current = outputAudioContextRef.current.createGain();
                outputNodeRef.current.connect(outputAudioContextRef.current.destination);
                outputNodeRef.current.gain.value = 1.0;
                console.log('[Audio] Pre-initialized output audio node');
            } catch (error) {
                console.warn('[Audio] Failed to pre-initialize output audio node:', error);
            }
        }
        
        // Pre-initialize input audio context (will be resumed when mic is clicked)
        if (!inputAudioContextRef.current || inputAudioContextRef.current.state === 'closed') {
            try {
                inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                console.log('[Audio] Pre-initialized input audio context');
            } catch (error) {
                console.warn('[Audio] Failed to pre-initialize input audio context:', error);
            }
        }
    }, []); // Run once on mount
    
    // Auto-show text input in test environments or when microphone is unavailable
    useEffect(() => {
        // Check if we're in a test environment
        const isTestEnv = window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1' ||
                         window.location.hostname.includes('localhost') ||
                         (window as any).__TEST_MODE__ ||
                         navigator.userAgent.includes('HeadlessChrome') ||
                         navigator.userAgent.includes('Playwright');
        
        // In test environments, always show text input by default
        if (isTestEnv) {
            console.log('[Test Mode] Text input enabled for testing');
            setShowTextInput(true);
            return;
        }
        
        // Check if microphone is available (for production)
        const checkMicAvailability = async () => {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    console.log('[Mic] MediaDevices API not available, enabling text input');
                    setShowTextInput(true);
                    return;
                }
                // Try to enumerate devices to check if mic exists (requires permission first)
                // For now, we'll enable text input if we can't access devices
                try {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const hasAudioInput = devices.some(device => device.kind === 'audioinput');
                    if (!hasAudioInput) {
                        console.log('[Mic] No audio input devices found, enabling text input');
                        setShowTextInput(true);
                    }
                } catch (enumError) {
                    // If enumeration fails (no permission), enable text input as fallback
                    console.log('[Mic] Could not enumerate devices, enabling text input fallback');
                    setShowTextInput(true);
                }
            } catch (error) {
                // If we can't check, show text input as fallback
                console.warn('[Mic] Could not check microphone availability:', error);
                setShowTextInput(true);
            }
        };
        
        // Check mic availability
        checkMicAvailability();
    }, []);

    // Load user name from localStorage on mount for personalized greeting
    useEffect(() => {
        try {
            // Primary: Check for stored name in localStorage
            const storedName = localStorage.getItem('clara-user-name');
            if (storedName) {
                loginUserNameRef.current = storedName;
                console.log('[Greeting] Loaded user name from localStorage:', storedName);
            }
            
            // Also load full preChatDetails if available
            const storedDetails = localStorage.getItem('clara-prechat-details');
            if (storedDetails) {
                try {
                    const details = JSON.parse(storedDetails);
                    if (details.name && !loginUserNameRef.current) {
                        loginUserNameRef.current = details.name;
                    }
                    // Set preChatDetails if not already set
                    if (!preChatDetails && details.name) {
                        setPreChatDetails(details);
                        preChatDetailsRef.current = details;
                    }
                } catch (e) {
                    console.error('Failed to parse stored preChatDetails', e);
                }
            }
        } catch (error) {
            console.error("Failed to load user name from localStorage", error);
        }
    }, []);

    useEffect(() => {
        try {
            if (preChatDetails) {
                sessionStorage.setItem('clara-prechat-details', JSON.stringify(preChatDetails));
                // Also store in localStorage for persistence across sessions
                localStorage.setItem('clara-prechat-details', JSON.stringify(preChatDetails));
                // Store name separately for easy access and update ref
                if (preChatDetails.name) {
                    localStorage.setItem('clara-user-name', preChatDetails.name);
                    loginUserNameRef.current = preChatDetails.name;
                    console.log('[Greeting] Updated login user name:', preChatDetails.name);
                }
            }
            if (messages.length > 0) {
              sessionStorage.setItem('clara-chat-history', JSON.stringify(messages));
            }
        } catch (error) {
            console.error("Failed to save to storage", error);
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
    const stopRecording = useCallback((closeSession = false) => {
        if (!isRecordingRef.current && !closeSession) return; // Prevent multiple stops (unless explicitly closing)
        
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
        if (analyserRef.current) {
            analyserRef.current.disconnect();
            analyserRef.current = null;
        }
        if (mediaStreamSourceRef.current) {
            mediaStreamSourceRef.current.disconnect();
            mediaStreamSourceRef.current = null;
        }
        if (inputAudioContextRef.current) {
            if (closeSession) {
                inputAudioContextRef.current.close().catch(console.error);
                inputAudioContextRef.current = null;
            } else if (inputAudioContextRef.current.state === 'running') {
                inputAudioContextRef.current.suspend().catch(console.error);
            }
        }
        
        silenceStartRef.current = null;
        
        // Only close session if explicitly requested (e.g., on error or user logout)
        // Don't close session after normal recording stops - keep it alive for next interaction
        if (closeSession && sessionPromiseRef.current) {
            sessionStateRef.current = 'closing';
            const currentPromise = sessionPromiseRef.current;
            sessionPromiseRef.current = null;

            currentPromise
                .then(session => {
                    if (session && typeof session.close === 'function') {
                        return Promise.resolve(session.close())
                            .catch(console.error)
                            .finally(() => {
                                liveSessionRef.current = null;
                                sessionStateRef.current = 'closed';
                            });
                    }
                    liveSessionRef.current = null;
                    sessionStateRef.current = 'closed';
                })
                .catch(error => {
                    console.error(error);
                    liveSessionRef.current = null;
                    sessionStateRef.current = 'closed';
                });
        }
        // Update session state based on whether a live session remains
        if (!closeSession) {
            if (sessionPromiseRef.current || (liveSessionRef.current && sessionStateRef.current !== 'closed')) {
                sessionStateRef.current = 'open';
            } else {
                sessionStateRef.current = 'closed';
            }
        }
        // Session stays alive for next interaction - no logging needed
    }, []);

    // Actual call initiation function (called after confirmation)
    const startCallAfterConfirmation = useCallback(async (staffToCall: any) => {
        if (isRecordingRef.current) {
            stopRecording(false);
        }

        // Use DevicePermissionPrompt instead of inline permission request
        if (!callStore.canInitiate()) {
            console.warn('[Call] Cannot initiate call from current state:', callStore.state);
            return;
        }

        // Show permission prompt
        callStore.initiateCall('Voice-initiated video call');
        setPendingCallStaff(staffToCall);
        setShowPermissionPrompt(true);
    }, [callStore, stopRecording]);
    
    // Handle permission prompt result
    const handlePermissionGranted = useCallback(async (stream: MediaStream, audioOnly: boolean) => {
        setShowPermissionPrompt(false);
        const staffToCall = pendingCallStaff;
        if (!staffToCall) {
            callStore.reset();
            return;
        }

        callStore.setPreparing();
        setToast({ type: 'connecting', message: 'Connecting to staff...' });

        // Show confirmation message
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setMessages(prev => [...prev, { sender: 'clara', text: `Initiating video call with ${staffToCall.name}...`, isFinal: true, timestamp }]);
        
        // Store stream in callStore
        callStore.setInCall({ localStream: stream });

        // ALWAYS use unifiedCallService for WebRTC calls via sockets
        if (unifiedCallService) {
            console.log('[Call] Using unifiedCallService to initiate WebRTC call');
            try {
                // Map shortName to email prefix (how server identifies staff)
                // The server uses email prefix (e.g., 'nagashreen' from 'nagashreen@gmail.com')
                // as the staffId for socket rooms, so we need to extract it from the email
                const emailPrefix = staffToCall.email.split('@')[0];
                
                callStore.setDialing(''); // Will be set when we get callId
                const result = await unifiedCallService.startCall({
                    targetStaffId: emailPrefix, // Use email prefix instead of shortName
                    purpose: 'Voice-initiated video call',
                    clientName: preChatDetailsRef.current?.name, // Send client name from prechat
                    onAccepted: (callId, roomName) => {
                        console.log('[Client] ===== CALL ACCEPTED =====');
                        console.log('[Client] Call ID:', callId, 'Room:', roomName);
                        console.log('[Client] Staff:', staffToCall);
                        
                        // Update call status
                        setCallStatus({ callId, status: 'accepted' });
                        
                        // Update callStore
                        callStore.onAccepted(callId, { id: staffToCall.email.split('@')[0], name: staffToCall.name });
                        callStore.setConnecting();
                        setToast({ type: 'accepted', message: 'Call accepted! Connecting...' });
                        
                        // Get peer connection from CallService
                        const callData = unifiedCallService.getActiveCall(callId);
                        console.log('[Client] Call data from service:', callData);
                        
                        if (callData) {
                            console.log('[Client] Setting activeCall with peer connection...');
                            setActiveCall({
                                callId,
                                roomName,
                                pc: callData.pc,
                                stream: callData.stream,
                                remoteStream: callData.remoteStream || null,
                            });
                            
                            // Update callStore with peer connection and streams
                            callStore.setInCall({
                                peerConnection: callData.pc,
                                localStream: callData.stream,
                                remoteStream: callData.remoteStream || null,
                            });
                            
                            // Watch for remote stream updates
                            const checkRemoteStream = () => {
                                const updatedCallData = unifiedCallService.getActiveCall(callId);
                                if (updatedCallData && updatedCallData.remoteStream) {
                                    console.log('[Client] Remote stream detected, updating activeCall...');
                                    setActiveCall(prev => prev ? {
                                        ...prev,
                                        remoteStream: updatedCallData.remoteStream,
                                    } : null);
                                    callStore.setInCall({ remoteStream: updatedCallData.remoteStream });
                                } else if (updatedCallData) {
                                    // Check again in a bit
                                    setTimeout(checkRemoteStream, 500);
                                }
                            };
                            setTimeout(checkRemoteStream, 500);
                        } else {
                            console.warn('[Client] No call data found, setting basic activeCall...');
                            setActiveCall({
                                callId,
                                roomName,
                            });
                        }
                        
                        setVideoCallTarget(staffToCall);
                        console.log('[Client] Switching to video_call view...');
                        setView('video_call');
                        
                        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        setMessages(prev => [...prev, { sender: 'clara', text: `Video call with ${staffToCall.name} connected!`, isFinal: true, timestamp }]);
                        
                        console.log('[Client] View should now be:', 'video_call');
                    },
                    onDeclined: (reason) => {
                        // Preserve callId when updating status to declined
                        setCallStatus(prev => {
                            if (prev && prev.callId) {
                                return { callId: prev.callId, status: 'declined' };
                            }
                            return null;
                        });
                        callStore.onDeclined(reason);
                        setToast({ type: 'declined', message: reason || 'Call declined by staff' });
                        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        setMessages(prev => [...prev, { sender: 'clara', text: `Call declined${reason ? ': ' + reason : ''}.`, isFinal: true, timestamp }]);
                        setView('chat');
                        // Clear call status after delay for testing visibility
                        setTimeout(() => {
                            setCallStatus(null);
                            setActiveCall(null);
                            setVideoCallTarget(null);
                        }, 5000);
                    },
                    onEnded: ({ callId: endedCallId }) => {
                        if (endedCallId && lastEndedCallIdRef.current === endedCallId) {
                            lastEndedCallIdRef.current = null;
                            return;
                        }
                        lastEndedCallIdRef.current = null;
                        const staffName = staffToCall.name;
                        finalizeCallSession(`Video call with ${staffName} ended. How can I assist you further?`, {
                            notifyServer: false,
                            showSummary: true,
                        });
                    },
                    onAppointmentUpdate: ({ status, details }) => {
                        const staffName = details?.staffName || staffToCall.name;
                        const clientName = details?.clientName || preChatDetailsRef.current?.name || 'You';
                        const scheduleInfo =
                            details?.date && details?.time
                                ? `${details.date} at ${details.time}`
                                : 'soon';
                        const purposeText = details?.purpose ? ` Purpose: ${details.purpose}.` : '';
                        const message =
                            status === 'confirmed'
                                ? `Appointment confirmed with ${staffName} on ${scheduleInfo}.${purposeText}`
                                : `Appointment with ${staffName} was declined.${purposeText}`;
                        const timestamp = new Date().toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        });
                        setMessages((prev) => [
                            ...prev,
                            {
                                sender: 'clara',
                                text: message,
                                isFinal: true,
                                timestamp,
                            },
                        ]);
                    },
                    onError: (error) => {
                        console.error('Call error:', error);
                        // Preserve callId when updating status to error
                        setCallStatus(prev => {
                            if (prev && prev.callId) {
                                return { callId: prev.callId, status: 'error' };
                            }
                            return null;
                        });
                        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        setMessages(prev => [...prev, { sender: 'clara', text: `Failed to start call: ${error.message}`, isFinal: true, timestamp }]);
                        setView('chat');
                        // Clear call status after delay for testing visibility
                        setTimeout(() => {
                            setCallStatus(null);
                            setActiveCall(null);
                            setVideoCallTarget(null);
                        }, 5000);
                    }
                });

                if (result) {
                    callStore.setDialing(result.callId);
                    callStore.setRinging();
                    
                    // Set call status for UI display and testing
                    setCallStatus({ 
                        callId: result.callId,
                        roomName: result.roomName,
                        status: 'ringing' 
                    });
                    
                    // Get peer connection from CallService
                    const callData = unifiedCallService.getActiveCall(result.callId);
                    if (callData) {
                        setActiveCall({
                            callId: result.callId,
                            roomName: result.roomName,
                            pc: callData.pc,
                            stream: callData.stream,
                            remoteStream: callData.remoteStream,
                        });
                        callStore.setInCall({
                            peerConnection: callData.pc,
                            localStream: callData.stream,
                            remoteStream: callData.remoteStream || null,
                        });
                    } else {
                        setActiveCall({
                            callId: result.callId,
                            roomName: result.roomName,
                        });
                    }
                    setVideoCallTarget(staffToCall);
                    
                    // Show ringing message
                    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    setMessages(prev => [...prev, { sender: 'clara', text: `Ringing ${staffToCall.name}...`, isFinal: true, timestamp }]);
                } else {
                    setCallStatus(null); // Clear call status on failure
                    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    setMessages(prev => [...prev, { sender: 'clara', text: 'Failed to start call. Please try again.', isFinal: true, timestamp }]);
                }
            } catch (error) {
                console.error('Call initiation error:', error);
                const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                setMessages(prev => [...prev, { sender: 'clara', text: `Failed to start call: ${error.message}`, isFinal: true, timestamp }]);
            }
        } else {
            // If unifiedCallService is not available, try to initialize it
            console.warn('[Call] unifiedCallService not available, attempting to initialize...');
            // Always use backend server port (8080), not the client dev server port
            const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:8080';
            console.log('[Call] Using API base for retry:', apiBase);
            
            try {
                const response = await fetch(`${apiBase}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: 'client-' + Date.now(),
                        role: 'client',
                    }),
                });
                
                const data = await response.json();
                if (data.token) {
                    localStorage.setItem('clara-jwt-token', data.token);
                    localStorage.setItem('clara-token-timestamp', Date.now().toString());
                    // Store refresh token if provided
                    if (data.refreshToken) {
                        localStorage.setItem('clara-refresh-token', data.refreshToken);
                    }
                    const clientId = 'client-' + Date.now();
                    localStorage.setItem('clara-client-id', clientId);
                    const service = new CallService({
                        token: data.token,
                        clientId,
                    });
                    setUnifiedCallService(service);
                    
                    // Retry call initiation with newly created service
                    console.log('[Call] Retrying call with newly initialized service');
                    const retryResult = await service.startCall({
                        targetStaffId: staffToCall.email.split('@')[0],
                        purpose: 'Voice-initiated video call',
                        clientName: preChatDetailsRef.current?.name, // Send client name from prechat
                        onAccepted: (callId, roomName) => {
                            console.log('Call accepted:', callId, 'Room:', roomName);
                            setActiveCall({
                                callId,
                                roomName,
                            });
                            setVideoCallTarget(staffToCall);
                            setView('video_call');
                            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            setMessages(prev => [...prev, { sender: 'clara', text: `Video call with ${staffToCall.name} connected!`, isFinal: true, timestamp }]);
                        },
                        onDeclined: (reason) => {
                            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            setMessages(prev => [...prev, { sender: 'clara', text: `Call declined${reason ? ': ' + reason : ''}.`, isFinal: true, timestamp }]);
                            setView('chat');
                            setActiveCall(null);
                            setVideoCallTarget(null);
                        },
                        onEnded: ({ callId: endedCallId }) => {
                            if (endedCallId && lastEndedCallIdRef.current === endedCallId) {
                                lastEndedCallIdRef.current = null;
                                return;
                            }
                            lastEndedCallIdRef.current = null;
                            const staffName = staffToCall.name;
                            finalizeCallSession(`Video call with ${staffName} ended. How can I assist you further?`, {
                                notifyServer: false,
                                showSummary: true,
                            });
                        },
                        onError: (error) => {
                            console.error('Call error:', error);
                            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            setMessages(prev => [...prev, { sender: 'clara', text: `Failed to start call: ${error.message}`, isFinal: true, timestamp }]);
                            setView('chat');
                            setActiveCall(null);
                            setVideoCallTarget(null);
                        }
                    });
                    
                    if (retryResult) {
                        setActiveCall({
                            callId: retryResult.callId,
                            roomName: retryResult.roomName,
                        });
                        setVideoCallTarget(staffToCall);
                        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        setMessages(prev => [...prev, { sender: 'clara', text: `Ringing ${staffToCall.name}...`, isFinal: true, timestamp }]);
                    }
                } else {
                    throw new Error('Failed to get token');
                }
            } catch (error) {
                console.error('[Call] Failed to initialize service and start call:', error);
                const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                setMessages(prev => [...prev, { sender: 'clara', text: `Failed to start call. Please ensure the server is running and unified mode is enabled.`, isFinal: true, timestamp }]);
            }
        }
    }, [unifiedCallService, stopRecording, callStore, pendingCallStaff, setMessages, setToast]);

    // Handle manual call initiation - shows confirmation first
    const handleManualCallInitiation = useCallback(async (staffNameOrShortName?: string) => {
        // Check if in demo mode
        if (isDemoMode) {
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setMessages(prev => [...prev, { sender: 'clara', text: 'Video calls are not available in demo mode. Please configure an API key to enable video calling.', isFinal: true, timestamp }]);
            return;
        }

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

        startCallAfterConfirmation(staffToCall);
    }, [stopRecording, isDemoMode, startCallAfterConfirmation]);

    // Helper function to detect if query is college-related
    const isCollegeQuery = (text: string): boolean => {
        const collegeKeywords = [
            'college', 'admission', 'fee', 'fees', 'department', 'departments',
            'faculty', 'placement', 'event', 'events', 'campus', 'course', 'courses',
            'branch', 'cse', 'mechanical', 'civil', 'ece', 'ise', 'engineering',
            'saividya', 'svit', 'sai vidya', 'institute', 'academic', 'semester',
            'timetable', 'schedule', 'hostel', 'transport', 'library', 'lab',
            'professor', 'prof', 'dr.', 'doctor', 'staff', 'teacher', 'lecturer'
        ];
        
        // Also check for staff member names (including common variations)
        const staffNames = [
            'lakshmi durga', 'anitha', 'dhivyasri', 'nisha', 'amarnath', 
            'nagashree', 'nagashri', 'nagash', // Handle "Nagashri" vs "Nagashree"
            'anil kumar', 'jyoti', 'vidyashree', 'bhavana', 'bhavya', 
            'ldn', 'acs', 'gd', 'nsk', 'abp', 'nn', 'akv', 'jk', 'vr', 'ba', 'btn'
        ];
        
        const lowerText = text.toLowerCase();
        const hasCollegeKeyword = collegeKeywords.some(keyword => lowerText.includes(keyword));
        const hasStaffName = staffNames.some(name => lowerText.includes(name));
        
        return hasCollegeKeyword || hasStaffName;
    };

    // Helper function to detect language from text with confidence scoring
    // Enhanced to handle voice transcriptions and transliterated text
    const detectLanguage = (text: string): string => {
        if (!text || text.trim().length === 0) {
            return detectedLanguageRef.current || 'en'; // Return current language if text is empty
        }
        
        const normalizedText = text.toLowerCase().trim();
        
        // Count characters for each language to determine confidence
        const teluguPattern = /[\u0C00-\u0C7F]/g;
        const hindiPattern = /[\u0900-\u097F]/g;
        const tamilPattern = /[\u0B80-\u0BFF]/g;
        const kannadaPattern = /[\u0C80-\u0CFF]/g;
        const malayalamPattern = /[\u0D00-\u0D7F]/g;
        
        const teluguMatches = (text.match(teluguPattern) || []).length;
        const hindiMatches = (text.match(hindiPattern) || []).length;
        const tamilMatches = (text.match(tamilPattern) || []).length;
        const kannadaMatches = (text.match(kannadaPattern) || []).length;
        const malayalamMatches = (text.match(malayalamPattern) || []).length;
        
        // Calculate confidence scores (character count / total text length)
        const totalLength = text.length;
        let scores = {
            te: teluguMatches / totalLength,
            hi: hindiMatches / totalLength,
            ta: tamilMatches / totalLength,
            kn: kannadaMatches / totalLength,
            ml: malayalamMatches / totalLength,
            en: 1 - (teluguMatches + hindiMatches + tamilMatches + kannadaMatches + malayalamMatches) / totalLength
        };
        
        // Enhanced: Detect transliterated/common words/phrases for Indian languages
        // These patterns help identify when Gemini transcribes non-English speech as English
        const transliterationPatterns = {
            te: [
                /\b(em[ai]|nuvvu|meeru|nenu|vachanu|vacharu|undhi|ledhu|kaavali|kaavaledhu|chey|cheyandi|cheyadam|ippudu|appudu|ekkada|akkada|ela|entha|evaru|evari|idi|adi|velli|vasthe|avuthundhi|avuthundi)\b/gi,
                /\b(hello|hi|namaste|namaskaram|sir|madam|please|thank you|thanks|ok|okay|yes|no)\b/gi // Common English words that might appear
            ],
            hi: [
                /\b(main|tum|aap|hai|hain|nahi|nahin|kya|kaise|kab|kahan|kyun|kya|kar|karo|karne|kiya|kiye|gaya|gaye|aaya|aaye|hoga|hogi|honge|raha|rahi|rahe|tha|thi|the|ho|hoon|hoon|hun|hain)\b/gi,
                /\b(hello|hi|namaste|sir|madam|please|thank you|thanks|ok|okay|yes|no)\b/gi
            ],
            ta: [
                /\b(naan|nee|nenga|irukku|illai|pannu|pannunga|panniten|pannirukken|po|ponga|vandhen|vandhirukken|inga|ange|eppadi|enna|yaaru|edhu|idhu|adhu|vandhu|pogum|irukkum|irukka|pannum)\b/gi,
                /\b(hello|hi|vanakkam|sir|madam|please|thank you|thanks|ok|okay|yes|no)\b/gi
            ],
            kn: [
                /\b(naanu|neenu|nivu|ide|ade|yenu|yaake|yelli|hege|aagutte|aagalla|maad|maadiddu|maadbeku|ho|aagutte|barutte|hogutte|iddene|illa|beku|bedi)\b/gi,
                /\b(hello|hi|namaskara|sir|madam|please|thank you|thanks|ok|okay|yes|no)\b/gi
            ],
            ml: [
                /\b(naan|nee|ningal|und|illa|cheyy|cheyyum|cheyyan|pov|povum|povan|vann|vannu|vannum|vannal|aakum|aakilla|enth|eppozhum|evide|ethu|athu|ithu)\b/gi,
                /\b(hello|hi|namaskaram|sir|madam|please|thank you|thanks|ok|okay|yes|no)\b/gi
            ]
        };
        
        // If no native script characters found, check for transliterated patterns
        const hasNativeScript = teluguMatches + hindiMatches + tamilMatches + kannadaMatches + malayalamMatches > 0;
        
        if (!hasNativeScript && totalLength > 3) {
            // Check transliteration patterns
            for (const [lang, patterns] of Object.entries(transliterationPatterns)) {
                let matchCount = 0;
                for (const pattern of patterns) {
                    const matches = normalizedText.match(pattern);
                    if (matches) {
                        matchCount += matches.length;
                    }
                }
                if (matchCount > 0) {
                    // Boost score for transliterated text (weighted less than native script)
                    scores[lang] = Math.max(scores[lang], (matchCount / Math.max(normalizedText.split(/\s+/).length, 1)) * 0.6);
                }
            }
        }
        
        // Find language with highest confidence
        let maxScore = 0;
        let detectedLang = 'en';
        
        for (const [lang, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                detectedLang = lang;
            }
        }
        
        // Only return detected language if confidence is above threshold
        // For very short text, use a lower threshold
        // For transliterated text (no native script), use even lower threshold
        const confidenceThreshold = hasNativeScript 
            ? (text.length < 10 ? 0.05 : 0.1)
            : (text.length < 10 ? 0.15 : 0.25); // Higher threshold for transliterated text
        
        if (maxScore < confidenceThreshold && detectedLang !== 'en') {
            // Low confidence, check if text is mostly English (Latin characters)
            const latinPattern = /[a-zA-Z]/g;
            const latinMatches = (text.match(latinPattern) || []).length;
            const latinRatio = latinMatches / totalLength;
            
            // If mostly Latin and no strong language signal, default to English
            // But if we have a previous language detection, prefer that
            if (latinRatio > 0.7 && !hasNativeScript) {
                // Check if we have a previously detected language that might be more accurate
                const prevLang = detectedLanguageRef.current;
                if (prevLang && prevLang !== 'en' && scores[prevLang] > 0.1) {
                    return prevLang; // Prefer previous detection if there's any signal
                }
                return 'en';
            }
            // If not mostly Latin, return the detected language even with low confidence
        }
        
        // Log detection for debugging (only for non-English to reduce spam)
        if (detectedLang !== 'en' && maxScore > 0.1) {
            console.log(`[Language] Detected: ${detectedLang} (confidence: ${(maxScore * 100).toFixed(1)}%, native script: ${hasNativeScript})`);
        } else if (detectedLang !== 'en' && !hasNativeScript) {
            console.log(`[Language] Detected transliterated: ${detectedLang} (confidence: ${(maxScore * 100).toFixed(1)}%)`);
        }
        
        return detectedLang;
    };

    // Helper function to speak text using TTS (browser's speechSynthesis)
    const speakWithTTS = (text: string, language?: string) => {
        if (!('speechSynthesis' in window)) {
            console.warn('[TTS] Speech synthesis not supported');
            return;
        }
        
        // Clean text - remove markdown formatting
        const cleanText = text
            .replace(/\*\*/g, '') // Remove bold markers
            .replace(/\*/g, '') // Remove italic markers
            .replace(/#{1,6}\s/g, '') // Remove headers
            .replace(/•/g, '') // Remove bullet points
            .replace(/\n/g, ' ') // Replace newlines with spaces
            .trim();
        
        if (!cleanText) {
            console.warn('[TTS] Empty text after cleaning');
            return;
        }
        
        // Use detected language if not provided
        const langToUse = language || detectedLanguageRef.current || 'en';
        
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 0.95;
        utterance.pitch = 1.05;
        utterance.volume = 1.0;
        
        // Set language code based on detected language
        const languageCodes: Record<string, string> = {
            'te': 'te-IN', // Telugu
            'hi': 'hi-IN', // Hindi
            'ta': 'ta-IN', // Tamil
            'kn': 'kn-IN', // Kannada
            'ml': 'ml-IN', // Malayalam
            'mr': 'mr-IN', // Marathi
            'en': 'en-US'  // English
        };
        
        utterance.lang = languageCodes[langToUse] || 'en-US';
        
        // Get available voices (may need to wait for voices to load)
        const getVoices = (): SpeechSynthesisVoice[] => {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length === 0) {
                // Voices may not be loaded yet, wait a bit and try again
                console.log('[TTS] Voices not loaded yet, waiting...');
                return [];
            }
            return voices;
        };
        
        const selectVoice = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
            if (voices.length === 0) return null;
            
            // Preferred female voice names for each language
            const femaleVoiceNames = ['zira', 'hazel', 'susan', 'linda', 'karen', 'samantha', 'victoria', 'sarah', 'female'];
            
            // Language-specific voice selection
            const langPrefix = langToUse === 'te' ? 'te' :
                              langToUse === 'hi' ? 'hi' :
                              langToUse === 'ta' ? 'ta' :
                              langToUse === 'kn' ? 'kn' :
                              langToUse === 'ml' ? 'ml' :
                              langToUse === 'mr' ? 'mr' : 'en';
            
            // Try to find a female voice for the language
            let preferredVoice = voices.find(v => {
                const langMatch = v.lang.toLowerCase().startsWith(langPrefix.toLowerCase());
                const isFemale = femaleVoiceNames.some(name => v.name.toLowerCase().includes(name));
                return langMatch && isFemale;
            });
            
            // If no female voice found, try any voice for the language
            if (!preferredVoice) {
                preferredVoice = voices.find(v => 
                    v.lang.toLowerCase().startsWith(langPrefix.toLowerCase())
                );
            }
            
            // If still no voice found for the language, try to find any female voice
            if (!preferredVoice && langToUse === 'en') {
                preferredVoice = voices.find(v => 
                    femaleVoiceNames.some(name => v.name.toLowerCase().includes(name))
                );
            }
            
            // Fallback to default voice
            if (!preferredVoice) {
                preferredVoice = voices.find(v => v.default) || voices[0];
            }
            
            return preferredVoice || null;
        };
        
        const voices = getVoices();
        if (voices.length === 0) {
            // Wait for voices to load
            const onVoicesChanged = () => {
                window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
                const loadedVoices = getVoices();
                const selectedVoice = selectVoice(loadedVoices);
                if (selectedVoice) {
                    utterance.voice = selectedVoice;
                    console.log(`[TTS] Using voice: ${selectedVoice.name} (${selectedVoice.lang}) for language: ${langToUse}`);
                }
                window.speechSynthesis.speak(utterance);
            };
            
            window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
            // Trigger voiceschanged event by calling getVoices again
            setTimeout(() => {
                const loadedVoices = getVoices();
                if (loadedVoices.length > 0) {
                    onVoicesChanged();
                } else {
                    // If voices still not loaded, proceed without specific voice
                    console.warn('[TTS] Voices not available, using default');
                    window.speechSynthesis.speak(utterance);
                }
            }, 100);
        } else {
            const selectedVoice = selectVoice(voices);
            if (selectedVoice) {
                utterance.voice = selectedVoice;
                console.log(`[TTS] Using voice: ${selectedVoice.name} (${selectedVoice.lang}) for language: ${langToUse}`);
            }
            window.speechSynthesis.speak(utterance);
        }
        
        utterance.onend = () => {
            setStatus('Click the microphone to speak');
            console.log('[TTS] Speech ended');
        };
        utterance.onerror = (error) => {
            console.error('[TTS] Speech error:', error);
            setStatus('Click the microphone to speak');
        };
        setStatus('Speaking...');
    };

    // Helper function to generate Zephyr voice audio using Gemini (optional, falls back to TTS)
    const speakWithZephyr = async (text: string, language?: string) => {
        try {
            // Stop any ongoing AI audio playback first
            if (outputAudioContextRef.current && sourcesRef.current.size > 0) {
                sourcesRef.current.forEach(source => {
                    try {
                        source.stop();
                    } catch (e) {
                        // Ignore errors if already stopped
                    }
                });
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
            }
            
            // Clean text - remove markdown formatting
            const cleanText = text
                .replace(/\*\*/g, '') // Remove bold markers
                .replace(/\*/g, '') // Remove italic markers
                .replace(/#{1,6}\s/g, '') // Remove headers
                .replace(/•/g, '') // Remove bullet points
                .replace(/\n/g, ' ') // Replace newlines with spaces
                .trim();
            
            if (!cleanText) return;
            
            // Get API key
            const apiKey = process.env.API_KEY || 
                          import.meta.env.VITE_API_KEY || 
                          import.meta.env.VITE_GEMINI_API_KEY ||
                          'AIzaSyABTSkPg0qPKX3aH9pOMbXtX_BQo32O8Hg';
            
            // If no API key, use TTS instead
            if (!apiKey) {
                console.warn('No API key for Zephyr voice, falling back to TTS');
                speakWithTTS(cleanText, language);
                return;
            }
            
            // Ensure audio context is ready
            if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
                outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                // Resume audio context if it was suspended (browser autoplay policy)
                if (outputAudioContextRef.current.state === 'suspended') {
                    outputAudioContextRef.current.resume().catch(console.error);
                }
            }
            if (!outputNodeRef.current) {
                outputNodeRef.current = outputAudioContextRef.current.createGain();
                outputNodeRef.current.connect(outputAudioContextRef.current.destination);
                outputNodeRef.current.gain.value = 1.0;
            }
            
            // Use Gemini to generate audio with Zephyr voice
            const ai = new GoogleGenAI({ apiKey });
            setStatus('Speaking...');
            
            // Create a temporary session just for audio generation
            let sessionRef: any = null;
            let isSessionClosing = false;
            
            const closeSessionSafely = () => {
                if (!isSessionClosing && sessionRef) {
                    isSessionClosing = true;
                    try {
                        if (sessionRef && typeof sessionRef.close === 'function') {
                            sessionRef.close().catch(() => {}).finally(() => {
                                sessionRef = null;
                                isSessionClosing = false;
                            });
                        } else {
                            sessionRef = null;
                            isSessionClosing = false;
                        }
                    } catch (e) {
                        console.error('Error closing session:', e);
                        sessionRef = null;
                        isSessionClosing = false;
                    }
                }
            };
            
            const tempSessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: async () => {
                        // Session is ready, send text to generate audio
                        try {
                            const session = await tempSessionPromise;
                            if (session) {
                                sessionRef = session;
                                try {
                                    if (typeof (session as any).sendRealtimeInput === 'function') {
                                        (session as any).sendRealtimeInput({ text: cleanText });
                                    }
                                } catch (e) {
                                    const msg = (e as Error)?.message || '';
                                    if (!msg.toLowerCase().includes('closing') && !msg.toLowerCase().includes('closed')) {
                                        console.error('Error sending realtime greeting:', e);
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('Error in onopen:', error);
                            setStatus('Click the microphone to speak');
                        }
                    },
                    onmessage: async (message) => {
                        const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (base64Audio) {
                            try {
                                // Ensure audio context is resumed (browser may suspend it)
                                if (outputAudioContextRef.current.state === 'suspended') {
                                    await outputAudioContextRef.current.resume();
                                }
                                
                                const decodedAudio = decode(base64Audio);
                                const audioBuffer = await decodeAudioData(decodedAudio, outputAudioContextRef.current, 24000, 1);
                                
                                // Use lookahead buffer to prevent audio stuttering from scheduling too close to current time
                                const lookAheadTime = 0.1; // 100ms buffer to prevent underruns
                                const currentTime = outputAudioContextRef.current.currentTime;
                                const startTime = Math.max(nextStartTimeRef.current, currentTime + lookAheadTime);
                                
                                const source = outputAudioContextRef.current.createBufferSource();
                                source.buffer = audioBuffer;
                                source.connect(outputNodeRef.current);
                                source.start(startTime);
                                
                                nextStartTimeRef.current = startTime + audioBuffer.duration;
                                sourcesRef.current.add(source);
                                
                                source.onended = () => {
                                    sourcesRef.current.delete(source);
                                    // Only close session and reset when all audio chunks are done AND turn is complete
                                    if (sourcesRef.current.size === 0) {
                                        nextStartTimeRef.current = 0;
                                        setStatus('Click the microphone to speak');
                                        // Wait a bit more to ensure all audio is processed, then close
                                        setTimeout(() => {
                                            if (sourcesRef.current.size === 0) {
                                                closeSessionSafely();
                                            }
                                        }, 500);
                                    }
                                };
                            } catch (error) {
                                console.error('Error processing Zephyr audio:', error);
                                setStatus('Click the microphone to speak');
                                closeSessionSafely();
                            }
                        }
                        
                        // Check if turn is complete - but don't close immediately, wait for all audio to finish
                        if (message.serverContent?.turnComplete) {
                            // Mark that turn is complete, but let audio finish playing
                            // The session will close when all audio sources finish (in onended handler)
                            console.log('[Zephyr] Turn complete, waiting for audio to finish...');
                        }
                    },
                    onerror: (e) => {
                        console.error('Zephyr audio generation error:', e);
                        setStatus('Click the microphone to speak');
                        closeSessionSafely();
                    },
                    onclose: () => {
                        sessionRef = null;
                        isSessionClosing = false;
                    }
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { 
                        voiceConfig: { 
                            prebuiltVoiceConfig: { 
                                voiceName: 'Zephyr'
                            } 
                        } 
                    },
                    systemInstruction: `You are Clara, a friendly AI receptionist. Speak naturally and clearly. ${language ? `Respond in ${language === 'te' ? 'Telugu' : language === 'hi' ? 'Hindi' : language === 'ta' ? 'Tamil' : language === 'kn' ? 'Kannada' : language === 'ml' ? 'Malayalam' : 'English'}.` : ''}`,
                },
            });
            
        } catch (error) {
            console.error('Error in Zephyr voice generation:', error);
            setStatus('Click the microphone to speak');
        }
    };

    // Helper function to call College AI API (silent, no error messages)
    const callCollegeAI = async (query: string, sessionId: string): Promise<string> => {
        try {
            const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:8080';
            const response = await fetch(`${apiBase}/api/college/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: query,
                    sessionId: sessionId || 'client-' + Date.now(),
                    name: preChatDetailsRef.current?.name,
                    email: preChatDetailsRef.current?.phone // Using phone as contact
                })
            });
            
            if (!response.ok) {
                // Silently fallback - don't show error to user
                console.error('College AI API error:', response.statusText);
                return 'I don\'t have that information available right now. Could you please rephrase your question?';
            }
            
            const data = await response.json();
            return data.response || data.message || 'I don\'t have that information available right now. Could you please rephrase your question?';
        } catch (error: any) {
            // Silently handle errors - don't show technical error messages
            console.error('College AI API error:', error);
            return 'I don\'t have that information available right now. Could you please rephrase your question?';
        }
    };

    // Helper function to create message handler
    const createMessageHandler = () => {
        let finalTurnResponse: string | null = null;

        return async (message: any) => {
            // Early return if we're processing a college query - ignore all AI messages
            // Use ref for immediate check (state updates are async)
            if (isCollegeQueryActive || isCollegeQueryActiveRef.current) {
                return; // Don't process any AI messages while college query is active
            }
            
            // Handle tool calls first
            if (message.toolCall) {
                for (const fc of message.toolCall.functionCalls) {
                    if (fc.name === 'initiateVideoCall') {
                        // Check if in demo mode
                        if (isDemoMode) {
                            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            setMessages(prev => [...prev, { sender: 'clara', text: 'Video calls are not available in demo mode. Please configure an API key to enable video calling.', isFinal: true, timestamp }]);
                            return;
                        }
                        
                        // Always use the selected staff from preChatDetailsRef (mandatory selection)
                        // This ensures calls only go to the staff member selected in the dropdown
                        const selectedStaffShortName = preChatDetailsRef.current?.staffShortName;
                        if (!selectedStaffShortName) {
                            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            setMessages(prev => [...prev, { sender: 'clara', text: 'Please select a staff member first to initiate a call.', isFinal: true, timestamp }]);
                            return;
                        }
                        
                        // Send tool response to Gemini before tearing down session
                        try {
                            const session =
                                (sessionStateRef.current === 'open' ? liveSessionRef.current : null) ||
                                (sessionPromiseRef.current ? await sessionPromiseRef.current : null);
                            if (session && typeof session.sendToolResponse === 'function' && sessionStateRef.current === 'open') {
                                session.sendToolResponse({
                                    functionResponses: { id: fc.id, name: fc.name, response: { result: "Video call initiated successfully." } }
                                });
                            }
                        } catch (err) {
                            console.error('Error sending tool response:', err);
                        }

                        // Use the manual call initiation function which handles all the routing and confirmation messages
                        stopRecording(true);
                        await handleManualCallInitiation();
                    }
                }
                return;
            }

            // Handle real-time transcription updates (user) – accumulate full text
            if (message.serverContent?.inputTranscription) {
                const newText = message.serverContent.inputTranscription.text || '';
                inputAccumRef.current = appendDelta(inputAccumRef.current, newText);
                
                // Detect language from user input and update state immediately
                if (newText) {
                    const detectedLang = detectLanguage(inputAccumRef.current);
                    if (detectedLang !== detectedLanguageRef.current) {
                        detectedLanguageRef.current = detectedLang;
                        setDetectedLanguage(detectedLang);
                        console.log(`[Language] Detected language from input: ${detectedLang}`);
                    }
                }
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
            // Skip if this is a college query (we'll use College AI instead)
            // Skip if college query is active
            if (message.serverContent?.outputTranscription && !isCollegeQueryActive && !isCollegeQueryActiveRef.current) {
                const newText = message.serverContent.outputTranscription.text || '';
                outputAccumRef.current = appendDelta(outputAccumRef.current, newText);
                
                // Verify output text language matches detected language (for debugging)
                if (newText && detectedLanguageRef.current) {
                    const outputLang = detectLanguage(outputAccumRef.current);
                    if (outputLang !== detectedLanguageRef.current && outputLang !== 'en') {
                        // Log warning but still display text (Gemini may mix languages or use English for some responses)
                        console.log(`[Language] Output language (${outputLang}) differs from detected language (${detectedLanguageRef.current}) - TTS will use detected language`);
                    }
                }
                
                setMessages(prev => {
                    let lastClaraMsgIndex = -1;
                    for (let i = prev.length - 1; i >= 0; i--) {
                        if (prev[i].sender === 'clara' && !prev[i].isFinal && !prev[i].isCollegeAI) {
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
                // Get user text first
                const userText = inputAccumRef.current || '';
                
                // Finalize user message in state
                setMessages(prev => {
                    const updated = [...prev];
                    let lastUserIndex = -1;
                    for (let i = updated.length - 1; i >= 0; i--) {
                        if (updated[i].sender === 'user' && !updated[i].isFinal) { lastUserIndex = i; break; }
                    }
                    if (lastUserIndex >= 0) {
                        updated[lastUserIndex] = { ...updated[lastUserIndex], text: userText, isFinal: true };
                    }
                    return updated;
                });
                
                // Detect and update language from user input immediately
                if (userText) {
                    const detectedLang = detectLanguage(userText);
                    if (detectedLang !== detectedLanguageRef.current) {
                        detectedLanguageRef.current = detectedLang;
                        setDetectedLanguage(detectedLang);
                        console.log(`[Language] Detected language from final input: ${detectedLang}`);
                    }
                }
                
                // Check if this is an availability query - if so, handle it directly
                // This must be checked BEFORE college queries
                // Use feature flag check (can be set via env var or default to true for now)
                const scheduleFeatureEnabled = (import.meta as any).env?.VITE_FEATURE_SCHEDULE_V1 !== 'false';
                if (scheduleFeatureEnabled && userText) {
                    try {
                        // Dynamic import to avoid loading if feature is disabled
                        const { isAvailabilityQuery, handleAvailabilityQuery } = await import('./src/services/availabilityQueryHandler.js');
                        if (isAvailabilityQuery(userText)) {
                            // Set flag to prevent AI processing
                            isCollegeQueryActiveRef.current = true;
                            setIsCollegeQueryActive(true);
                            
                            // Stop any ongoing AI audio immediately
                            if (outputAudioContextRef.current && sourcesRef.current.size > 0) {
                                sourcesRef.current.forEach(source => {
                                    try {
                                        source.stop();
                                    } catch (e) {
                                        // Ignore errors
                                    }
                                });
                                sourcesRef.current.clear();
                                nextStartTimeRef.current = 0;
                            }
                            
                            // Stop any ongoing AI session immediately
                            if (sessionPromiseRef.current) {
                                try {
                                    const currentSessionPromise = sessionPromiseRef.current;
                                    sessionPromiseRef.current = null;
                                    currentSessionPromise.then(session => {
                                        if (session && typeof session.close === 'function') {
                                            session.close().catch(() => {});
                                        }
                                    }).catch(() => {});
                                } catch (e) {
                                    // Ignore errors
                                }
                            }
                            
                            // Stop recording if active
                            if (isRecordingRef.current) {
                                stopRecording(false);
                            }
                            
                            // Handle availability query
                            const availabilityResponse = await handleAvailabilityQuery(userText);
                            
                            // Add response to messages
                            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            setMessages(prev => [...prev, {
                                sender: 'clara',
                                text: availabilityResponse,
                                isFinal: true,
                                timestamp,
                            }]);
                            
                            // Speak the response using TTS
                            if (availabilityResponse && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                                speakWithTTS(availabilityResponse, detectedLanguageRef.current || 'en');
                            }
                            
                            // Reset flags
                            isCollegeQueryActiveRef.current = false;
                            setIsCollegeQueryActive(false);
                            return; // Don't process further
                        }
                    } catch (error) {
                        console.error('[Availability Query] Error:', error);
                        // Continue to normal processing if availability handler fails
                    }
                }
                
                // Check if this is a college-related query - if so, use College AI silently
                if (userText && isCollegeQuery(userText)) {
                    // Set flag immediately using ref (state updates are async)
                    isCollegeQueryActiveRef.current = true;
                    setIsCollegeQueryActive(true);
                    
                    // College query mode enabled
                    
                    // Stop any ongoing AI audio immediately (before response arrives)
                    if (outputAudioContextRef.current && sourcesRef.current.size > 0) {
                        sourcesRef.current.forEach(source => {
                            try {
                                source.stop();
                            } catch (e) {
                                // Ignore errors
                            }
                        });
                        sourcesRef.current.clear();
                        nextStartTimeRef.current = 0;
                    }
                    
                    // Stop any ongoing AI session immediately
                    if (sessionPromiseRef.current) {
                        try {
                            const currentSessionPromise = sessionPromiseRef.current;
                            sessionPromiseRef.current = null; // Clear immediately to prevent new messages
                            currentSessionPromise.then(session => {
                                if (session && typeof session.close === 'function') {
                                    session.close().catch(() => {}); // Silently close
                                }
                            }).catch(() => {});
                        } catch (e) {
                            // Ignore errors
                        }
                    }
                    
                    // Stop recording if active
                    if (isRecordingRef.current) {
                        stopRecording(false);
                    }
                    
                    const sessionId = localStorage.getItem('clara-client-id') || 'client-' + Date.now();
                    
                    // Call College AI API silently (no announcements)
                    callCollegeAI(userText, sessionId).then(collegeResponse => {
                                // Stop any ongoing AI audio immediately before TTS
                                if (outputAudioContextRef.current && sourcesRef.current.size > 0) {
                                    sourcesRef.current.forEach(source => {
                                        try {
                                            source.stop();
                                        } catch (e) {
                                            // Ignore errors
                                        }
                                    });
                                    sourcesRef.current.clear();
                                    nextStartTimeRef.current = 0;
                                }
                                
                                const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                setMessages(prevMessages => {
                                    // Remove any incomplete Clara message and add College AI response
                                    const filtered = prevMessages.filter((msg, idx) => 
                                        !(idx === prevMessages.length - 1 && msg.sender === 'clara' && !msg.isFinal)
                                    );
                                    return [...filtered, {
                                        sender: 'clara',
                                        text: collegeResponse,
                                        isFinal: true,
                                        timestamp,
                                        isCollegeAI: true // Mark as College AI response
                                    }];
                                });
                                
                                // Use TTS to read the College AI response
                                // Use detected language from user input (from ref, which is most up-to-date)
                                const userLang = detectedLanguageRef.current || detectLanguage(userText);
                                console.log(`[TTS] College AI response using language: ${userLang}`);
                                speakWithTTS(collegeResponse, userLang);
                                
                                setStatus('Click the microphone to speak');
                                // Reset flags after response
                                isCollegeQueryActiveRef.current = false;
                                setIsCollegeQueryActive(false);
                            }).catch(error => {
                                // Silently handle errors - show a simple message
                                console.error('College AI error:', error);
                                const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                setMessages(prevMessages => {
                                    const filtered = prevMessages.filter((msg, idx) => 
                                        !(idx === prevMessages.length - 1 && msg.sender === 'clara' && !msg.isFinal)
                                    );
                                    return [...filtered, {
                                        sender: 'clara',
                                        text: 'I don\'t have that information available right now. Could you please rephrase your question?',
                                        isFinal: true,
                                        timestamp
                                    }];
                                });
                                // Reset flags on error
                                isCollegeQueryActiveRef.current = false;
                                setIsCollegeQueryActive(false);
                            });
                            
                    // Clear accumulators immediately (don't wait for promise)
                    inputAccumRef.current = '';
                    outputAccumRef.current = '';
                    
                    // Don't process Gemini response for college queries - exit early
                    return; // Exit message handler early for college queries
                }
                
                // Not a college query - reset flags and continue with normal processing
                isCollegeQueryActiveRef.current = false;
                setIsCollegeQueryActive(false);
                
                // Check for location queries in user message first (before finalizing messages)
                const locationResult = locationMatcher.extractLocationIntent(userText);
                if (locationResult.location && locationResult.intent === 'navigate') {
                    const location = locationResult.location;
                    const responseText = `The ${location.name} is on the ${location.floor_name}. ${location.description} I'll show you the way on the map.`;
                    
                    // Show map
                    setCurrentLocation(location);
                    setCurrentFloor(location.floor);
                    setShowMap(true);
                    
                    // Add Clara's response with map
                    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    setMessages(prev => [...prev, {
                        sender: 'clara',
                        text: responseText,
                        isFinal: true,
                        timestamp,
                        hasMap: true,
                        locationData: location
                    }]);
                }
                
                // Finalize last Clara message (only if not a college query)
                setMessages(prev => {
                    const updated = [...prev];
                    
                    // Finalize last Clara message (only if not a college query)
                    let lastClaraIndex = -1;
                    for (let i = updated.length - 1; i >= 0; i--) {
                        if (updated[i].sender === 'clara' && !updated[i].isFinal && !updated[i].isCollegeAI) { 
                            lastClaraIndex = i; 
                            break; 
                        }
                    }
                    if (lastClaraIndex >= 0) {
                        updated[lastClaraIndex] = { ...updated[lastClaraIndex], text: outputAccumRef.current || updated[lastClaraIndex].text, isFinal: true };
                    }
                    return updated;
                });

                finalTurnResponse = outputAccumRef.current || '';
                
                // Clear accumulators for next turn
                inputAccumRef.current = '';
                outputAccumRef.current = '';
            }

            // Handle audio playback - process immediately without delay
            // Skip audio playback for College AI responses (they use TTS/Zephyr voice instead)
            // Also skip if TTS is currently speaking (different audio source)
            // IMPORTANT: Allow audio chunks to queue even when previous chunks are playing (removed !hasActiveAudio restriction)
            const base64EncodedAudioString = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            const isTTSActive = window.speechSynthesis && window.speechSynthesis.speaking;
            
            // Play AI audio if available and not in demo mode
            // Allow queuing multiple audio chunks from the same response turn
            const shouldPlayStream =
                !!base64EncodedAudioString &&
                !isDemoMode &&
                !isCollegeQueryActive &&
                !isCollegeQueryActiveRef.current &&
                !isTTSActive;

            if (shouldPlayStream) {
                // Cancel any ongoing TTS to prevent overlap/stutter
                try {
                    if (window.speechSynthesis?.speaking) {
                        window.speechSynthesis.cancel();
                    }
                } catch {}

                // Set status only if this is the first chunk (no active sources)
                if (sourcesRef.current.size === 0) {
                    setStatus('Responding...');
                }
                
                // Wrap async audio code in IIFE to handle await properly
                (async () => {
                    try {
                        // Ensure audio context is resumed (browser may suspend it)
                        if (outputAudioContextRef.current.state === 'suspended') {
                            await outputAudioContextRef.current.resume();
                        }
                        
                        const decodedAudio = decode(base64EncodedAudioString);
                        const audioBuffer = await decodeAudioData(decodedAudio, outputAudioContextRef.current, 24000, 1);

                        // Use lookahead buffer to prevent underruns and stutter
                        const lookAheadTime = 0.25; // 250ms buffer for smoother scheduling
                        const currentTime = outputAudioContextRef.current.currentTime;
                        // Queue audio chunks sequentially - nextStartTimeRef tracks where the next chunk should start
                        const startTime = Math.max(nextStartTimeRef.current, currentTime + lookAheadTime);
                        
                        const source = outputAudioContextRef.current.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputNodeRef.current);
                        source.start(startTime);
                        
                        // Update next start time for proper queuing of subsequent chunks
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
                })(); // Close async IIFE
            } else if (isCollegeQueryActive || isCollegeQueryActiveRef.current || isTTSActive) {
                // When TTS is active, or when it's a college query, skip AI audio playback
                // NOTE: This only affects audio OUTPUT playback, NOT voice INPUT recognition
                // Users can still speak and be recognized even when audio is playing
                if (isTTSActive) {
                    console.log('Skipping AI audio playback - TTS is currently speaking (voice input still works)');
                } else if (isCollegeQueryActive || isCollegeQueryActiveRef.current) {
                    console.log('Skipping AI audio playback - College query active (voice input still works)');
                }
                // Only update status if not currently recording
                if (!isRecordingRef.current) {
                    setStatus('Click the microphone to speak');
                }
            } else if (
                message.serverContent?.turnComplete &&
                finalTurnResponse &&
                finalTurnResponse.trim() &&
                !isCollegeQueryActive &&
                !isCollegeQueryActiveRef.current
            ) {
                const responseText = finalTurnResponse.trim();
                console.log('[TTS] Using TTS fallback for response');
                const langToUse = detectedLanguageRef.current || detectedLanguage;
                console.log(`[TTS] Using detected language: ${langToUse}`);
                speakWithTTS(responseText, langToUse);
            }
        };
    };

    // Helper function to initialize session
    const initializeSession = async (shouldGreet = false) => {
        // Simple check - if session exists and is usable, reuse it
        if (sessionPromiseRef.current) {
            if (sessionStateRef.current === 'open' || sessionStateRef.current === 'connecting') {
                return;
            }
        }

        sessionStateRef.current = 'connecting';
        liveSessionRef.current = null;

        // Try multiple ways to get the API key
        const apiKey = process.env.API_KEY || 
                      import.meta.env.VITE_API_KEY || 
                      import.meta.env.VITE_GEMINI_API_KEY ||
                      'AIzaSyABTSkPg0qPKX3aH9pOMbXtX_BQo32O8Hg';
        
        // Check if we're in demo mode (only if no API key at all, not if using fallback)
        const hasValidApiKey = apiKey && apiKey.trim() !== '' && apiKey !== 'undefined';
        if (!hasValidApiKey) {
            console.warn('API Key not found, entering demo mode');
            setIsDemoMode(true);
            // In demo mode, show a message but don't initialize session
            if (shouldGreet) {
                // Use stored login name with fallback chain: loginUserNameRef -> preChatDetailsRef -> empty
                const greetingUserName = loginUserNameRef.current || preChatDetailsRef.current?.name || '';
                const greetingText = greetingUserName 
                    ? `Hi ${greetingUserName}! I'm Clara, your friendly AI receptionist! I'm so excited to help you today! How can I assist you?`
                    : "Hi there! I'm Clara, your friendly AI receptionist! I'm so excited to help you today! How can I assist you?";
                console.log('[Greeting] Demo mode greeting for user:', greetingUserName || 'Unknown');
                setMessages([{ sender: 'clara', text: greetingText, isFinal: true, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                setStatus('Demo mode: Click the microphone to speak or use the demo call button.');
            }
            return;
        } else {
            setIsDemoMode(false);
        }
        
        console.log('Using API Key:', apiKey.substring(0, 10) + '...');
        const ai = new GoogleGenAI({ apiKey });
        
        // Use pre-initialized audio context or create if needed
        if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            console.log('[Session] Created new output audio context');
        } else {
            console.log('[Session] Using pre-initialized output audio context');
        }
        // Resume audio context if it was suspended (browser autoplay policy)
        if (outputAudioContextRef.current.state === 'suspended') {
            outputAudioContextRef.current.resume().catch(console.error);
        }
        if (!outputNodeRef.current) {
            outputNodeRef.current = outputAudioContextRef.current.createGain();
            outputNodeRef.current.connect(outputAudioContextRef.current.destination);
            outputNodeRef.current.gain.value = 1.0;
        }

        // Get user name with fallback chain: loginUserNameRef -> preChatDetailsRef -> empty
        const userName = loginUserNameRef.current || preChatDetailsRef.current?.name || '';
        const { purpose, staffShortName } = preChatDetailsRef.current || {};
        const selectedStaff = staffList.find(s => s.shortName === staffShortName);
        const staffHint = selectedStaff ? `${selectedStaff.name} (${selectedStaff.shortName})` : 'Not specified';
        
        // Detect current language from recent user messages and update ref immediately
        const recentUserMessages = messages.filter(m => m.sender === 'user').slice(-3);
        const allUserText = recentUserMessages.map(m => m.text).join(' ') || '';
        const currentLang = detectLanguage(allUserText || inputAccumRef.current || '');
        if (currentLang !== detectedLanguageRef.current) {
            detectedLanguageRef.current = currentLang;
            if (currentLang !== detectedLanguage) {
                setDetectedLanguage(currentLang);
            }
        }
        
        // Get language name for system instruction
        const langName = currentLang === 'hi' ? 'Hindi' : 
                        currentLang === 'te' ? 'Telugu' : 
                        currentLang === 'ta' ? 'Tamil' : 
                        currentLang === 'kn' ? 'Kannada' : 
                        currentLang === 'ml' ? 'Malayalam' : 'English';
        
        const systemInstruction = `**PRIMARY DIRECTIVE: You MUST detect the user's language and respond ONLY in that same language. This is a strict requirement.**

You are CLARA, the official, friendly, and professional AI receptionist for Sai Vidya Institute of Technology (SVIT). Your goal is to assist users efficiently. Keep your spoken responses concise and to the point to ensure a fast, smooth conversation.

**CRITICAL LANGUAGE DETECTION AND RESPONSE RULES:**
- **CURRENT DETECTED LANGUAGE: ${langName} (${currentLang})**
- You MUST respond in ${langName} (${currentLang}) if the user is speaking in ${langName}. This is NON-NEGOTIABLE.
- Always respond in the EXACT same language the user uses. If the user speaks in Telugu, respond in Telugu. If they speak in Hindi, respond in Hindi. If they speak in English, respond in English. Match their language EXACTLY.
- If the user switches languages, immediately switch your response language to match. Do NOT continue in the previous language.
- Even if the transcription appears in English but the user is speaking in ${langName}, you MUST respond in ${langName}.
- Your response text MUST be displayed in the same script as the user's language (e.g., if user speaks Telugu, respond in Telugu script, not transliterated).
- Language detection happens in real-time - pay attention to the user's actual spoken language, not just the transcription format.

**IMPORTANT: College Query Detection**
- If the user asks about college-related topics (admissions, fees, departments, faculty, placements, events, campus, courses, etc.), the system will automatically route to College AI for detailed information.
- For non-college queries, continue with normal AI assistance.

**Caller Information (Context):**
- Name: ${userName || 'Unknown'}
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
2.  **College Information:** For detailed college information (admissions, fees, departments, etc.), the system will automatically switch to College AI to provide comprehensive answers.
3.  **Actions:**
    - If the user expresses a clear intent to start a video call or meet with a specific staff member (e.g., 'call Anitha', 'I want to see Prof. Lakshmi'), you MUST use the \`initiateVideoCall\` tool. Do not just confirm; use the tool directly.
    - If asked about schedules or availability, offer to check.
4.  **General Queries:** For topics outside of SVIT, act as a helpful general AI assistant.
5.  **Tone:** Always be polite, professional, and helpful.`;
        
        const messageHandler = createMessageHandler();
        
        const connectPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: async () => {
                    setStatus('Clara is ready!');
                    sessionStateRef.current = 'open';
                    
                    // Send greeting if requested
                    if (shouldGreet) {
                        // Use stored login name with fallback chain: loginUserNameRef -> preChatDetailsRef -> empty
                        const greetingUserName = loginUserNameRef.current || preChatDetailsRef.current?.name || '';
                        const greetingText = greetingUserName 
                            ? `Hi ${greetingUserName}! I'm Clara, your friendly AI receptionist! I'm so excited to help you today! How can I assist you?`
                            : "Hi there! I'm Clara, your friendly AI receptionist! I'm so excited to help you today! How can I assist you?";
                        
                        console.log('[Greeting] Sending personalized greeting for user:', greetingUserName || 'Unknown');
                        
                        const greetingMessage = {
                            sender: 'clara',
                            text: greetingText,
                            isFinal: true,
                            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        };
                        setMessages(prev => {
                            const alreadyHasGreeting = prev.some(
                                msg => msg.sender === 'clara' && msg.text === greetingText
                            );
                            if (alreadyHasGreeting) return prev;
                            if (prev.length === 0) return [greetingMessage];
                            return [...prev, greetingMessage];
                        });

                        try {
                            if (sessionPromiseRef.current) {
                                const session = await sessionPromiseRef.current;
                                // Send as text input to trigger audio response
                                if (session && typeof (session as any).sendRealtimeInput === 'function') {
                                    try {
                                        (session as any).sendRealtimeInput({ text: greetingText });
                                    } catch (e) {
                                        const msg = (e as Error)?.message || '';
                                        if (!msg.toLowerCase().includes('closing') && !msg.toLowerCase().includes('closed')) {
                                            console.error('Error sending greeting via realtime:', e);
                                        }
                                    }
                                }
                            } else {
                                // Fallback to text message if session not ready
                                setMessages([{ sender: 'clara', text: greetingText, isFinal: true, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                            }
                        } catch (error) {
                            console.error('Error sending greeting:', error);
                            // Fallback to text message - silently handle error
                            setMessages([{ sender: 'clara', text: greetingText, isFinal: true, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                        }
                    }
                },
                onmessage: messageHandler,
                onerror: (e) => {
                    console.error('[Session] Error:', e);
                    const message = e?.message?.toLowerCase?.() || '';
                    if (message.includes('closing') || message.includes('closed')) {
                        sessionStateRef.current = 'closing';
                    }
                    // Don't close session on error - try to recover
                    setStatus(`Error: ${e.message}. Please try speaking again.`);
                    // Only close if it's a critical error
                    if (e.message?.includes('closed') || e.message?.includes('disconnected')) {
                        stopRecording(true);
                    } else {
                        // For other errors, keep session alive and let user retry
                        stopRecording(false);
                    }
                },
                onclose: () => {
                    // Session closed - clear reference so it can be recreated on next mic click
                    console.log('[Session] Session closed, will be recreated on next mic click');
                    sessionPromiseRef.current = null;
                    liveSessionRef.current = null;
                    sessionStateRef.current = 'closed';
                    if (isRecordingRef.current) {
                        stopRecording(false);
                    }
                    // Don't show error - user can click mic to reconnect
                    if (!isRecordingRef.current) {
                        setStatus('Click the microphone to speak');
                    }
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { 
                    voiceConfig: { 
                        prebuiltVoiceConfig: { 
                            voiceName: 'Zephyr'
                        } 
                    } 
                },
                systemInstruction: systemInstruction,
                // Add language hints to improve transcription accuracy for Indian languages
                inputAudioTranscription: {
                    // Map language codes to BCP-47 format for Gemini API
                    languageCodes: currentLang === 'te' ? ['te-IN'] :
                                  currentLang === 'hi' ? ['hi-IN'] :
                                  currentLang === 'ta' ? ['ta-IN'] :
                                  currentLang === 'kn' ? ['kn-IN'] :
                                  currentLang === 'ml' ? ['ml-IN'] :
                                  currentLang === 'mr' ? ['mr-IN'] :
                                  ['en-US', 'hi-IN', 'te-IN', 'ta-IN', 'kn-IN', 'ml-IN', 'mr-IN'], // Support all if not detected
                },
                outputAudioTranscription: {},
                tools: [{ functionDeclarations: [initiateVideoCallFunction] }],
            },
        });

        sessionPromiseRef.current = connectPromise
            .then(session => {
                liveSessionRef.current = session;
                sessionStateRef.current = 'open';
                return session;
            })
            .catch(error => {
                liveSessionRef.current = null;
                sessionStateRef.current = 'closed';
                throw error;
            });
    };

    // Ensure we have a LIVE, OPEN session before starting microphone capture
    const ensureLiveSessionReady = async (): Promise<any> => {
        // Fast path: already open and available
        if (sessionStateRef.current === 'open' && liveSessionRef.current) {
            return liveSessionRef.current;
        }

        // If currently connecting, await the promise
        if (sessionStateRef.current === 'connecting' && sessionPromiseRef.current) {
            const s = await sessionPromiseRef.current;
            if (s && typeof (s as any).sendRealtimeInput === 'function') {
                sessionStateRef.current = 'open';
                liveSessionRef.current = s;
                return s;
            }
        }

        // Otherwise re-init a fresh session
        sessionPromiseRef.current = null;
        sessionStateRef.current = 'connecting';
        await initializeSession(false);

        if (!sessionPromiseRef.current) {
            sessionStateRef.current = 'closed';
            throw new Error('Session initialization failed (no promise)');
        }
        const s = await sessionPromiseRef.current;
        if (!s || typeof (s as any).sendRealtimeInput !== 'function') {
            sessionStateRef.current = 'closed';
            throw new Error('Session initialization failed (not ready)');
        }
        sessionStateRef.current = 'open';
        liveSessionRef.current = s;
        return s;
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
            // Fallback to text greeting if audio fails - use stored login name with fallback chain
            const greetingUserName = loginUserNameRef.current || details?.name || preChatDetailsRef.current?.name || '';
            const welcomeText = greetingUserName 
                ? `Hi ${greetingUserName}! I'm Clara, your friendly AI receptionist! I'm so excited to help you today! How can I assist you?` 
                : "Hi there! I'm Clara, your friendly AI receptionist! I'm so excited to help you today! How can I assist you?";
            console.log('[Greeting] Error fallback greeting for user:', greetingUserName || 'Unknown');
            setMessages([{ sender: 'clara', text: welcomeText, isFinal: true, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        }
    };

    const finalizeCallSession = useCallback(
        (message: string, options: { notifyServer?: boolean; showSummary?: boolean } = {}) => {
            const { notifyServer = true, showSummary = true } = options;
            callStore.endCall();
            setToast({ type: 'ended', message });

            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setMessages(prev => [...prev, { sender: 'clara', text: message, isFinal: true, timestamp }]);

            if (activeCall && notifyServer) {
                lastEndedCallIdRef.current = activeCall.callId;
                if (unifiedCallService) {
                    unifiedCallService.endCall(activeCall.callId);
                } else {
                    if (activeCall.stream) {
                        activeCall.stream.getTracks().forEach(track => track.stop());
                    }
                    if (activeCall.remoteStream) {
                        activeCall.remoteStream.getTracks().forEach(track => track.stop());
                    }
                }
            } else {
                lastEndedCallIdRef.current = null;
            }

            setActiveCall(null);
            setView('chat');
            setVideoCallTarget(null);
            setShowEndSummary(showSummary);

            if (sessionPromiseRef.current) {
                setStatus('Clara is ready! Click the microphone to speak.');
            } else {
                setStatus('Click the microphone to speak');
            }
        },
        [activeCall, unifiedCallService, callStore]
    );

    // Handler to send text messages (fallback when microphone unavailable)
    const handleSendTextMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        
        const messageText = textInput.trim();
        if (!messageText) return;
        
        // Add user message to chat
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setMessages(prev => [...prev, { 
            sender: 'user', 
            text: messageText, 
            isFinal: true, 
            timestamp 
        }]);
        setTextInput(''); // Clear input
        
        // Detect language from text input
        const detectedLang = detectLanguage(messageText);
        if (detectedLang !== detectedLanguageRef.current) {
            detectedLanguageRef.current = detectedLang;
            setDetectedLanguage(detectedLang);
            console.log(`[Language] Detected language from text input: ${detectedLang}`);
        }
        
        // Update input accumulator for language detection
        inputAccumRef.current = messageText;
        
        // Try to send via session if available
        try {
            let session = liveSessionRef.current;

            if (!session || sessionStateRef.current !== 'open') {
                await initializeSession(false);
                session = liveSessionRef.current;
                if (!session && sessionPromiseRef.current) {
                    session = await sessionPromiseRef.current;
                }
            }

            if (session && sessionStateRef.current === 'open' && typeof session.sendRealtimeInput === 'function') {
                await session.sendRealtimeInput({ text: messageText });
                setStatus('Message sent. Clara is responding...');
                return;
            }
        } catch (error) {
            const msg = (error as Error)?.message?.toLowerCase?.() || '';
            if (msg.includes('closing') || msg.includes('closed')) {
                sessionStateRef.current = 'closed';
                liveSessionRef.current = null;
            }
            console.error('Error sending text message via session:', error);
        }
        
        // If no session, check if it's a college query and handle accordingly
        if (isCollegeQuery(messageText)) {
            setIsCollegeQueryActive(true);
            isCollegeQueryActiveRef.current = true;
            setStatus('Processing college query...');
            
            try {
                const sessionId = localStorage.getItem('clara-client-id') || 'client-' + Date.now();
                const collegeResponse = await callCollegeAI(messageText, sessionId);
                const userLang = detectedLanguageRef.current || detectLanguage(messageText);
                console.log(`[TTS] College AI response using language: ${userLang}`);
                speakWithTTS(collegeResponse, userLang);
                
                setMessages(prev => [...prev, {
                    sender: 'clara',
                    text: collegeResponse,
                    isFinal: true,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }]);
                
                setIsCollegeQueryActive(false);
                isCollegeQueryActiveRef.current = false;
                setStatus('Ready to chat');
            } catch (error) {
                console.error('Error calling College AI:', error);
                setMessages(prev => [...prev, {
                    sender: 'clara',
                    text: 'Sorry, I encountered an error processing your query. Please try again.',
                    isFinal: true,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }]);
                setIsCollegeQueryActive(false);
                isCollegeQueryActiveRef.current = false;
                setStatus('Error occurred. Please try again.');
            }
        } else {
            // No session available and not a college query
            setStatus('Session not available. Please wait for Clara to initialize or try using voice input.');
            setMessages(prev => [...prev, {
                sender: 'clara',
                text: 'I\'m having trouble connecting right now. Please try again in a moment or use voice input.',
                isFinal: true,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]);
        }
    };

    const handleEndCall = () => {
        const staffName = videoCallTarget?.name || 'Staff';
        if (activeCall?.callId) {
            setCallStatus({ callId: activeCall.callId, status: 'ended' });
            setTimeout(() => {
                setCallStatus(null);
            }, 5000);
        }

        finalizeCallSession(
            `Video call with ${staffName} ended. How can I assist you further?`,
            { notifyServer: true, showSummary: true }
        );
    };

    const handleMicClick = async () => {
        if (isRecordingRef.current) {
            stopRecording(false);
            setStatus('Processing...');
            return;
        }

        // Ensure session is live/open before we start the mic
        try {
            await ensureLiveSessionReady();
        } catch (err) {
            console.error('[Mic] Cannot start – session not ready:', err);
            sessionPromiseRef.current = null;
            sessionStateRef.current = 'closed';
            setStatus('Reconnecting... Please try again.');
            return;
        }

        // Set recording state immediately for better UX
        isRecordingRef.current = true;
        setIsRecording(true);
        setStatus('Starting...');

        try {
            console.log('[Mic] Starting audio capture...');
            
            setShowTextInput(false);

            // Use pre-initialized audio context or create if needed
            if (!inputAudioContextRef.current || inputAudioContextRef.current.state === 'closed') {
                inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                console.log('[Mic] Created new audio context');
            } else {
                console.log('[Mic] Using pre-initialized audio context');
            }
            
            // Resume audio context if suspended (browser autoplay policy) - do this in parallel with other setup
            const resumePromise = inputAudioContextRef.current.state === 'suspended' 
                ? inputAudioContextRef.current.resume().then(() => {
                    console.log('[Mic] Audio context resumed');
                }).catch((resumeError) => {
                    console.warn('[Mic] Failed to resume audio context:', resumeError);
                })
                : Promise.resolve();

            // Verify/initialize session in parallel with audio context resume
            const sessionInitPromise = (async () => {
                let sessionValid = false;
                if (sessionPromiseRef.current) {
                    try {
                        const session = await sessionPromiseRef.current;
                        if (session && typeof session.sendRealtimeInput === 'function') {
                            sessionValid = true;
                            console.log('[Mic] Using existing session for voice recognition');
                            return session; // Return the session so we can verify it's ready
                        }
                    } catch (error) {
                        console.log('[Mic] Session check failed, will reinitialize:', error);
                        sessionPromiseRef.current = null;
                    }
                }

                if (!sessionValid) {
                    console.log('[Mic] Initializing new session for voice recognition...');
                    await initializeSession(false);
                    // Wait for session to be ready after initialization
                    if (!sessionPromiseRef.current) {
                        throw new Error('Session initialization failed - no session promise created');
                    }
                    const session = await sessionPromiseRef.current;
                    if (!session || typeof session.sendRealtimeInput !== 'function') {
                        throw new Error('Session initialization failed - session not ready');
                    }
                    return session;
                }
            })();

            // Request microphone access in parallel with session initialization
            console.log('[Mic] Requesting microphone access...');
            const primaryConstraints: MediaStreamConstraints = {
                audio: {
                    channelCount: { ideal: 1 },
                    sampleRate: { ideal: 16000 },
                    echoCancellation: { ideal: true },
                    noiseSuppression: { ideal: true },
                    autoGainControl: { ideal: true },
                }
            };
            
            const streamPromise = (async (): Promise<MediaStream> => {
                try {
                    return await navigator.mediaDevices.getUserMedia(primaryConstraints);
                } catch (error) {
                    console.warn('[Mic] Primary constraints failed, retrying with basic audio constraints:', error);
                    return await navigator.mediaDevices.getUserMedia({ audio: true });
                }
            })();
            
            // Wait for all parallel operations to complete
            const [stream, , session] = await Promise.all([streamPromise, resumePromise, sessionInitPromise]);
            
            streamRef.current = stream;
            console.log('[Mic] Microphone access granted, setting up audio processing...');
            
            // Final session verification - session should already be ready from sessionInitPromise
            if (!session || typeof session.sendRealtimeInput !== 'function') {
                throw new Error('Session not ready for audio input');
            }
            
            console.log('[Mic] Session verified and ready for audio input');
            
            // Store verified session reference for direct access in audio processing
            liveSessionRef.current = session;
            sessionStateRef.current = 'open';

            // Ensure audio context is still available (it may have been suspended or closed by prior teardown)
            if (!inputAudioContextRef.current || inputAudioContextRef.current.state === 'closed') {
                inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            } else if (inputAudioContextRef.current.state === 'suspended') {
                await inputAudioContextRef.current.resume().catch(console.error);
            }
            
            mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
            
            // Use AnalyserNode for silence detection (no deprecation warnings)
            analyserRef.current = inputAudioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 2048;
            analyserRef.current.smoothingTimeConstant = 0.8;
            mediaStreamSourceRef.current.connect(analyserRef.current);
            
            // Use ScriptProcessorNode for audio capture (required for Gemini API PCM format)
            // Note: ScriptProcessorNode is deprecated but still functional and required for PCM output
            // We suppress deprecation warnings by handling errors gracefully
            scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            
            const calculateRMS = () => {
                if (!analyserRef.current) return 0;
                analyserRef.current.getByteTimeDomainData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    const normalized = (dataArray[i] - 128) / 128;
                    sum += normalized * normalized;
                }
                return Math.sqrt(sum / dataArray.length);
            };
            
            silenceStartRef.current = null;
            let audioSendErrors = 0;
            const MAX_AUDIO_SEND_ERRORS = 10;
            
            // Process audio with ScriptProcessorNode (for Gemini API PCM compatibility)
            // Note: ScriptProcessorNode is deprecated but required for Gemini API PCM format
            // This will continue to work but may show deprecation warnings in console
            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                if (!isRecordingRef.current) return;
                if (sessionStateRef.current !== 'open') return;
                
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                
                // Convert to PCM blob for Gemini API
                const pcmBlob = createBlob(inputData);
                
                // Use verified session directly (fastest path)
                let sessionUsed = false;
                const currentSession = liveSessionRef.current;
                if (currentSession && typeof currentSession.sendRealtimeInput === 'function') {
                    // Direct session access - fastest path
                    try {
                        currentSession.sendRealtimeInput({ media: pcmBlob });
                        audioSendErrors = 0; // Reset error count on success
                        sessionUsed = true; // Successfully sent, no need for fallback
                    } catch (err: any) {
                        audioSendErrors++;
                        // Handle closed session gracefully
                        if (err && err.message && err.message.includes('closed')) {
                            console.warn('[Audio] Verified session closed, will try promise fallback');
                            liveSessionRef.current = null;
                            sessionStateRef.current = 'closed';
                            // Will fall through to promise-based access to get fresh session
                        } else if (audioSendErrors >= MAX_AUDIO_SEND_ERRORS) {
                            console.error('[Audio] Too many audio send errors, stopping recording');
                            if (isRecordingRef.current) {
                                stopRecording(false);
                                setStatus('Connection lost. Please try again.');
                            }
                            return; // Stop processing
                        } else if (audioSendErrors % 5 === 0) { // Log every 5th error
                            console.warn(`[Audio] Error sending audio input (${audioSendErrors}/${MAX_AUDIO_SEND_ERRORS}):`, err);
                        }
                        // If error is not "closed", don't try fallback
                        if (!err || !err.message || !err.message.includes('closed')) {
                            return; // Don't try fallback for non-closed errors
                        }
                    }
                }
                
                // Fallback to promise-based access if verified session failed or not available
                if (!sessionUsed && sessionPromiseRef.current && sessionStateRef.current === 'open') {
                    // Fallback to promise-based access
                    sessionPromiseRef.current.then((session) => {
                        // Check if session is still open before sending
                        if (
                            session &&
                            typeof session.sendRealtimeInput === 'function' &&
                            isRecordingRef.current &&
                            sessionStateRef.current === 'open'
                        ) {
                            try {
                                session.sendRealtimeInput({ media: pcmBlob });
                                audioSendErrors = 0; // Reset error count on success
                            } catch (err: any) {
                                audioSendErrors++;
                                // Handle closed session gracefully
                                if (err && err.message && err.message.includes('closed')) {
                                    console.warn('[Audio] Session closed, stopping recording');
                                    liveSessionRef.current = null;
                                    sessionStateRef.current = 'closed';
                                    if (isRecordingRef.current) {
                                        stopRecording(false);
                                    }
                                } else if (audioSendErrors >= MAX_AUDIO_SEND_ERRORS) {
                                    console.error('[Audio] Too many audio send errors, stopping recording');
                                    if (isRecordingRef.current) {
                                        stopRecording(false);
                                        setStatus('Connection lost. Please try again.');
                                    }
                                } else if (audioSendErrors % 5 === 0) { // Log every 5th error
                                    console.warn(`[Audio] Error sending audio input (${audioSendErrors}/${MAX_AUDIO_SEND_ERRORS}):`, err);
                                }
                            }
                        }
                    }).catch(err => {
                        // Only log session promise errors if recording is still active
                        if (!isRecordingRef.current) return;
                        
                        audioSendErrors++;
                        if (err && err.message && err.message.includes('closed')) {
                            console.warn('[Audio] Session promise rejected (closed), stopping recording');
                            liveSessionRef.current = null;
                            sessionStateRef.current = 'closed';
                            if (isRecordingRef.current) {
                                stopRecording(false);
                            }
                        } else if (audioSendErrors % 5 === 0) {
                            console.error("[Audio] Session promise error:", err);
                        }
                    });
                }
                // Silently ignore if no session - it will be set up soon
            };
            
            // Connect ScriptProcessorNode
            mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
            
            // Update status now that everything is ready
            setStatus('Listening...');
            console.log('[Mic] Audio processing fully set up and ready');
            
            // Monitor silence using AnalyserNode (separate from audio capture to reduce warnings)
            const checkSilence = () => {
                if (!isRecordingRef.current) return;
                
                const volume = calculateRMS();
                const SILENCE_THRESHOLD = 0.01;
                const SPEECH_TIMEOUT = 2000; // Increased to 2 seconds to allow for natural pauses

                if (volume > SILENCE_THRESHOLD) {
                    // Speech detected - reset silence timer
                    if (silenceStartRef.current !== null) {
                        console.log('[Audio] Speech detected, resetting silence timer');
                    }
                    silenceStartRef.current = null;
                } else {
                    // Silence detected
                    if (silenceStartRef.current === null) {
                        silenceStartRef.current = Date.now();
                    } else {
                        const silenceDuration = Date.now() - silenceStartRef.current;
                        if (silenceDuration > SPEECH_TIMEOUT) {
                            console.log('[Audio] Silence timeout reached, stopping recording');
                            if (isRecordingRef.current) {
                                stopRecording(false);
                                return;
                            }
                        }
                    }
                }
                
                requestAnimationFrame(checkSilence);
            };
            
            checkSilence();

        } catch (error: any) {
            console.error('[Mic] Error starting recording:', error);
            
            // Handle device not found error gracefully
            if (error.name === 'NotFoundError' || error.message?.includes('Requested device not found')) {
                console.warn('[Mic] Microphone device not available, enabling text input fallback');
                setStatus('Microphone not available. Please use text input instead.');
                setShowTextInput(true); // Show text input fallback
                setIsRecording(false);
                isRecordingRef.current = false;
                return;
            }
            
            // Handle permission denied with better messaging
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                console.warn('[Mic] Microphone permission denied');
                setStatus('Microphone permission denied. Please allow microphone access and try again, or use text input.');
                setShowTextInput(true); // Show text input fallback
                setIsRecording(false);
                isRecordingRef.current = false;
                return;
            }
            
            // Handle constraint not satisfied
            if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
                console.warn('[Mic] Audio constraints not satisfied, trying with basic constraints');
                try {
                    // Retry with basic constraints
                    streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                    console.log('[Mic] Microphone access granted with basic constraints');
                    // Continue with setup (would need to refactor to avoid duplication)
                    setStatus('Microphone accessed with basic settings. Some features may be limited.');
                } catch (retryError: any) {
                    console.error('[Mic] Retry with basic constraints also failed:', retryError);
                    setStatus('Microphone not available. Please use text input instead.');
                    setShowTextInput(true);
                    setIsRecording(false);
                    isRecordingRef.current = false;
                    return;
                }
            }
            
            // Handle other errors with retry logic for transient failures
            if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                console.warn('[Mic] Microphone may be in use, will retry once');
                setStatus('Microphone may be in use. Please wait...');
                // Wait a bit and retry once
                setTimeout(async () => {
                    try {
                        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                        console.log('[Mic] Microphone access granted on retry');
                        setStatus('Microphone ready. Click again to start.');
                    } catch (retryError) {
                        console.error('[Mic] Retry also failed:', retryError);
                        setStatus('Microphone not available. Please use text input instead.');
                        setShowTextInput(true);
                    }
                }, 1000);
                setIsRecording(false);
                isRecordingRef.current = false;
                return;
            }
            
            // Handle other errors
            setStatus(`Error: ${error.message || 'Failed to access microphone'}. Please use text input instead.`);
            setShowTextInput(true); // Show text input fallback
            isRecordingRef.current = false;
            setIsRecording(false);
        }
    };
    
    const handleWelcomeStart = () => {
        setShowWelcomeScreen(false);
        setShowPreChatModal(true);
    };

    const renderContent = () => {
        if (showWelcomeScreen) {
            return <WelcomeScreen onStartConversation={handleWelcomeStart} />;
        }
        if (showPreChatModal) {
            return <PreChatModal onStart={handleStartConversation} />;
        }
        if (view === 'video_call' && videoCallTarget && activeCall) {
            console.log('[Client] Rendering video call view');
            console.log('[Client] activeCall:', activeCall);
            console.log('[Client] unifiedCallService:', !!unifiedCallService);
            
            // Get latest call data from CallService
            const callData = unifiedCallService?.getActiveCall(activeCall.callId);
            console.log('[Client] callData from service:', callData);
            
            const webrtcCall = callData ? {
                pc: callData.pc,
                stream: callData.stream,
                remoteStream: callData.remoteStream,
            } : (activeCall.pc ? {
                pc: activeCall.pc,
                stream: activeCall.stream!,
                remoteStream: activeCall.remoteStream || null,
            } : null);
            
            console.log('[Client] webrtcCall:', webrtcCall);
            
            // Use new CallRoom component if callStore is in_call, otherwise use old WebRTCVideoCall for compatibility
            if (callStore.state === 'in_call' && callStore.callData.localStream) {
                console.log('[Client] Rendering new CallRoom component');
                return (
                    <>
                        <CallRoom onEndCall={handleEndCall} />
                        {toast && (
                            <CallToast
                                type={toast.type}
                                message={toast.message}
                                onDismiss={() => setToast(null)}
                                duration={3000}
                            />
                        )}
                    </>
                );
            } else if (webrtcCall && webrtcCall.pc) {
                console.log('[Client] Rendering WebRTCVideoCall component (legacy)');
                return (
                    <>
                        <WebRTCVideoCall
                            callId={activeCall.callId}
                            staffName={videoCallTarget.name}
                            onEndCall={handleEndCall}
                            activeCall={webrtcCall}
                            onRemoteStreamUpdate={(remoteStream) => {
                                console.log('[Client] Remote stream updated in WebRTCVideoCall');
                                // Update activeCall state when remote stream arrives
                                setActiveCall(prev => prev ? {
                                    ...prev,
                                    remoteStream,
                                } : null);
                                // Also update in CallService
                                if (unifiedCallService) {
                                    const callData = unifiedCallService.getActiveCall(activeCall.callId);
                                    if (callData) {
                                        callData.remoteStream = remoteStream;
                                    }
                                }
                                // Update callStore
                                callStore.setInCall({ remoteStream });
                            }}
                        />
                        {toast && (
                            <CallToast
                                type={toast.type}
                                message={toast.message}
                                onDismiss={() => setToast(null)}
                                duration={3000}
                            />
                        )}
                    </>
                );
            }
            // Fallback: show connecting message
            console.log('[Client] No webrtcCall yet, showing connecting message');
            return (
                <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
                    <div className="text-white text-xl">Connecting to {videoCallTarget.name}...</div>
                    <div className="text-white text-sm mt-4">Call ID: {activeCall.callId}</div>
                </div>
            );
        }
        return (
            <>
                {/* Device Permission Prompt */}
                <DevicePermissionPrompt
                    visible={showPermissionPrompt}
                    onPermissionsGranted={handlePermissionGranted}
                    onCancel={() => {
                        setShowPermissionPrompt(false);
                        callStore.reset();
                        setPendingCallStaff(null);
                    }}
                />
                {/* Call End Summary */}
                <CallEndSummary
                    visible={showEndSummary}
                    onClose={() => {
                        setShowEndSummary(false);
                        callStore.reset();
                    }}
                />
            <div className="app-container">
                <div className="header">
                     <div className="header-left">
                        <RobotIcon size={28} />
                        <span>Clara</span>
                    </div>
                    <div className="header-right">
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
                                            clientName: preChatDetailsRef.current?.name, // Send client name from prechat
                                            onAccepted: (callId, roomName) => {
                                                console.log('Call accepted:', callId, roomName);
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
                                            onEnded: ({ callId: endedCallId }) => {
                                                if (endedCallId && lastEndedCallIdRef.current === endedCallId) {
                                                    lastEndedCallIdRef.current = null;
                                                    return;
                                                }
                                                lastEndedCallIdRef.current = null;
                                                finalizeCallSession('Video call ended. Let me know if you need anything else.', {
                                                    notifyServer: false,
                                                    showSummary: true,
                                                });
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
                    
                </div>

                <div className="footer">
                    {/* Call Status Display (for testing and debugging) */}
                    {callStatus && (
                        <div className="call-status-display" data-testid="call-status" style={{ 
                            padding: '8px 12px', 
                            marginBottom: '8px', 
                            backgroundColor: '#f0f0f0', 
                            borderRadius: '4px',
                            fontSize: '12px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <span><strong>Call ID:</strong> <span data-testid="call-id">{callStatus.callId}</span></span>
                            <span><strong>Status:</strong> <span data-testid="call-status-text">{callStatus.status}</span></span>
                        </div>
                    )}
                    
                    {/* Text Input Field (always available as fallback, can be toggled) */}
                    {showTextInput && (
                        <form onSubmit={handleSendTextMessage} style={{ 
                            display: 'flex', 
                            gap: '8px', 
                            marginBottom: '8px',
                            padding: '0 8px'
                        }} data-testid="text-input-form">
                            <input
                                type="text"
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                placeholder="Type your message..."
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    border: '1px solid #ccc',
                                    borderRadius: '4px',
                                    fontSize: '14px'
                                }}
                                data-testid="text-input"
                                aria-label="Text input for chat messages"
                            />
                            <button
                                type="submit"
                                disabled={!textInput.trim()}
                                style={{
                                    padding: '10px 20px',
                                    backgroundColor: '#4CAF50',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: textInput.trim() ? 'pointer' : 'not-allowed',
                                    opacity: textInput.trim() ? 1 : 0.5
                                }}
                                data-testid="send-text-button"
                                aria-label="Send text message"
                            >
                                Send
                            </button>
                        </form>
                    )}
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button 
                            className={`mic-button ${isRecording ? 'recording' : ''}`} 
                            onClick={handleMicClick}
                            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                            data-testid="mic-button"
                            disabled={showTextInput && !navigator.mediaDevices?.getUserMedia}
                        >
                            <MicOnIcon size={28} />
                        </button>
                        <div className="footer-status-text" data-testid="status-text">
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
                            {/* Toggle text input button - always visible for testing */}
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowTextInput(!showTextInput);
                                }}
                                style={{
                                    padding: '4px 8px',
                                    marginLeft: '8px',
                                    fontSize: '12px',
                                    backgroundColor: showTextInput ? '#4CAF50' : '#ccc',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    pointerEvents: 'auto'
                                }}
                                data-testid="toggle-text-input"
                                aria-label={showTextInput ? 'Hide text input' : 'Show text input'}
                            >
                                {showTextInput ? 'Hide Text' : 'Show Text'}
                            </button>
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

// Store root instance to prevent multiple initializations
let rootInstance: ReturnType<typeof createRoot> | null = null;
let isInitializing = false;

function initializeApp() {
    // Prevent multiple simultaneous initializations
    if (isInitializing) {
        console.warn('App initialization already in progress, skipping...');
        return;
    }
    
    try {
        isInitializing = true;
        const rootElement = document.getElementById('root');
        if (!rootElement) {
            throw new Error('Root element not found');
        }
        
        // Clear any existing content to prevent conflicts
        const existingRoot = (rootElement as any)._reactRootContainer;
        if (existingRoot) {
            try {
                // Try to unmount existing root if possible
                if (typeof existingRoot.unmount === 'function') {
                    existingRoot.unmount();
                }
            } catch (e) {
                // Ignore unmount errors
            }
            // Clear the reference
            delete (rootElement as any)._reactRootContainer;
        }
        
        // Remove data-reactroot attribute if present
        if (rootElement.hasAttribute('data-reactroot')) {
            rootElement.removeAttribute('data-reactroot');
        }
        
        // Always create a new root instance for clean initialization
        rootInstance = createRoot(rootElement);
        
        rootInstance.render(
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        );
        
        // Mark root element as initialized
        rootElement.setAttribute('data-reactroot', 'true');
        console.log('App initialized successfully');
    } catch (error: any) {
        console.error('Failed to initialize app:', error);
        const rootElement = document.getElementById('root') || document.body;
        
        // Only show error UI if we're not already showing an error
        if (!rootElement.querySelector('.error-container')) {
            rootElement.innerHTML = `
                <div class="error-container" style="padding: 20px; text-align: center; font-family: Arial, sans-serif;">
                    <h2>Failed to load application</h2>
                    <p>${error.message || 'Unknown error'}</p>
                    <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 10px; cursor: pointer;">Reload Page</button>
                </div>
            `;
        }
    } finally {
        isInitializing = false;
    }
}

// Wait for DOM to be ready before rendering
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeApp();
    });
} else {
    initializeApp();
}
