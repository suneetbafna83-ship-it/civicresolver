import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike | undefined;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResultLike | undefined;
}

interface SpeechRecognitionEventLike {
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike {
  readonly error?: string;
}

interface SpeechRecognitionInstanceLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstanceLike;

function resolveSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const winRecord = window as unknown as Record<string, unknown>;
  const standard = winRecord['SpeechRecognition'];
  if (typeof standard === 'function') {
    return standard as SpeechRecognitionConstructor;
  }
  const webkit = winRecord['webkitSpeechRecognition'];
  if (typeof webkit === 'function') {
    return webkit as SpeechRecognitionConstructor;
  }
  return null;
}

export interface UseSpeechToTextOptions {
  readonly onTranscript: (transcript: string) => void;
  readonly lang?: string;
}

export interface UseSpeechToTextState {
  readonly isSupported: boolean;
  readonly isListening: boolean;
  readonly statusMessage: string | null;
  readonly toggleListening: () => void;
}

export function useSpeechToText(
  options: UseSpeechToTextOptions,
): UseSpeechToTextState {
  const { onTranscript, lang = 'en-US' } = options;
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const isSupported = resolveSpeechRecognitionConstructor() !== null;

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const toggleListening = useCallback(() => {
    const Ctor = resolveSpeechRecognitionConstructor();
    if (Ctor === null) {
      setStatusMessage(
        'Voice dictation is unavailable in this browser. Type or use a sample preset above.',
      );
      return;
    }

    if (isListening && recognitionRef.current !== null) {
      recognitionRef.current.stop();
      setIsListening(false);
      setStatusMessage('Voice capture stopped.');
      return;
    }

    try {
      const instance = new Ctor();
      instance.continuous = false;
      instance.interimResults = false;
      instance.lang = lang;

      instance.onresult = (event: SpeechRecognitionEventLike) => {
        const chunks: string[] = [];
        for (let i = 0; i < event.results.length; i += 1) {
          const item = Reflect.get(event.results, i) as
            | SpeechRecognitionResultLike
            | undefined;
          const firstAlt = item ? Reflect.get(item, 0) : undefined;
          if (firstAlt && firstAlt.transcript.trim().length > 0) {
            chunks.push(firstAlt.transcript.trim());
          }
        }
        const combined = chunks.join(' ');
        if (combined.length > 0) {
          onTranscript(combined);
          setStatusMessage('Voice added to description.');
        }
      };

      instance.onerror = (event: SpeechRecognitionErrorEventLike) => {
        setIsListening(false);
        setStatusMessage(
          `Voice input error (${event.error ?? 'permission'}). You can continue typing.`,
        );
      };

      instance.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = instance;
      instance.start();
      setIsListening(true);
      setStatusMessage('Listening... Speak your civic issue clearly.');
    } catch {
      setIsListening(false);
      setStatusMessage('Could not start microphone capture.');
    }
  }, [isListening, lang, onTranscript]);

  return {
    isSupported,
    isListening,
    statusMessage,
    toggleListening,
  };
}
