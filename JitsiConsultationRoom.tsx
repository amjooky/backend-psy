import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

interface JitsiMeetingProps {
  appointmentId: string;
  onLeave?: () => void;
}

interface AccessConfig {
  roomName: string;
  password?: string;
  token: string;
  domain: string;
}

export const JitsiConsultationRoom: React.FC<JitsiMeetingProps> = ({
  appointmentId,
  onLeave,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const [config, setConfig] = useState<AccessConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // 1. Fetch secure room details & JWT token from backend
  useEffect(() => {
    const fetchAccess = async () => {
      try {
        setLoading(true);
        const accessToken = localStorage.getItem('token'); // Retrieve authenticated user JWT
        const response = await axios.get(
          `/api/v1/consultations/appointments/${appointmentId}/access`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        setConfig(response.data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to authorize joining this consultation.');
      } finally {
        setLoading(false);
      }
    };

    fetchAccess();
  }, [appointmentId]);

  // 2. Load Jitsi Meet External API Script Dynamically
  useEffect(() => {
    if (!config) return;

    const scriptId = 'jitsi-external-api-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    const initJitsi = () => {
      if (!containerRef.current) return;

      // Ensure cleanup of previous session instance if any
      if (apiRef.current) {
        apiRef.current.dispose();
      }

      // Initialize Jitsi Meet iframe via official Jitsi Meet External API
      const options = {
        roomName: config.roomName,
        width: '100%',
        height: '100%',
        parentNode: containerRef.current,
        jwt: config.token || undefined,
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          requireDisplayName: true,
          prejoinPageEnabled: true, // Waiting room/prejoin landing
          lobby: {
            enabled: true, // Waiting Room support
          },
          disableDeepLinking: true,
          toolbarButtons: [
            'microphone',
            'camera',
            'closedcaptions',
            'desktop',
            'fullscreen',
            'fodeviceselection',
            'hangup',
            'profile',
            'chat',
            'recording',
            'livestreaming',
            'etherpad',
            'sharedvideo',
            'settings',
            'raisehand',
            'videoquality',
            'filmstrip',
            'invite',
            'feedback',
            'stats',
            'shortcuts',
            'tileview',
            'videobackgroundblur',
            'download',
            'help',
            'mute-everyone',
            'security',
          ],
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          DEFAULT_BACKGROUND: '#1A1D21',
        },
      };

      const api = new window.JitsiMeetExternalAPI(config.domain, options);
      apiRef.current = api;

      // Set password if required/available
      if (config.password) {
        api.addEventListener('participantRoleChanged', (event: any) => {
          if (event.role === 'moderator') {
            api.executeCommand('password', config.password);
          }
        });
      }

      // Hangup event listeners
      api.addEventListener('videoConferenceLeft', () => {
        if (onLeave) onLeave();
      });
    };

    if (window.JitsiMeetExternalAPI) {
      initJitsi();
    } else {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://${config.domain}/external_api.js`;
      script.async = true;
      script.onload = initJitsi;
      document.body.appendChild(script);
    }

    return () => {
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [config, onLeave]);

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.text}>Connecting to secure Monpsy medical session...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <h3 style={styles.errorHeader}>Access Denied</h3>
        <p style={styles.errorText}>{error}</p>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div style={styles.indicatorContainer}>
          <div style={styles.indicatorPulse}></div>
          <span style={styles.indicatorLabel}>Secure HIPAA-Compliant End-to-End Session</span>
        </div>
      </div>
      <div ref={containerRef} style={styles.container} />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    width: '100vw',
    height: '100vh',
    backgroundColor: '#0F1113',
    fontFamily: "'Outfit', sans-serif",
  },
  header: {
    height: '50px',
    backgroundColor: '#16191C',
    display: 'flex',
    alignItems: 'center',
    padding: '0 24px',
    borderBottom: '1px solid #23272C',
  },
  indicatorContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  indicatorPulse: {
    width: '10px',
    height: '10px',
    backgroundColor: '#10B981',
    borderRadius: '50%',
    boxShadow: '0 0 8px #10B981',
    animation: 'pulse 2s infinite',
  },
  indicatorLabel: {
    color: '#9CA3AF',
    fontSize: '13px',
    fontWeight: 500,
  },
  container: {
    flex: 1,
    width: '100%',
    height: 'calc(100% - 50px)',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100vw',
    height: '100vh',
    backgroundColor: '#0F1113',
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '4px solid #23272C',
    borderTop: '4px solid #3B82F6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  text: {
    color: '#9CA3AF',
    marginTop: '20px',
    fontSize: '15px',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100vw',
    height: '100vh',
    backgroundColor: '#0F1113',
    padding: '24px',
    textAlign: 'center',
  },
  errorHeader: {
    color: '#EF4444',
    fontSize: '24px',
    fontWeight: 600,
    marginBottom: '10px',
  },
  errorText: {
    color: '#9CA3AF',
    fontSize: '16px',
    maxWidth: '500px',
    lineHeight: 1.6,
  },
};
