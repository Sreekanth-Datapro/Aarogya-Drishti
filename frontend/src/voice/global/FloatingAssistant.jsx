import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ImagePlus,
  LoaderCircle,
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  speakAzureText,
  unlockAzureAudio,
} from "../azureTtsPlayer";
import { normalizeSpeechLocale } from "../azureSpeechConfig";
import useAzureSpeechRecognition from "../useAzureSpeechRecognition";
import { useGlobalVoice } from "./GlobalVoiceContext";
import "./floatingAssistant.css";

const MASCOT_PATH = "/assets/images/robot-mascot.png";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const COPY = {
  en: {
    title: "Aarogya Assistant",
    welcome: "Hi! Ask me about Aarogya Drishti or anything else.",
    placeholder: "Type a message…",
    send: "Send",
    listening: "Listening… speak, then pause",
    stopListening: "Stop listening",
    startListening: "Start voice input",
    unavailable: "Assistant is unavailable. Please try again.",
    voiceUnavailable: "Your message was sent, but voice playback is unavailable.",
    imageTypeError: "Choose a JPEG, PNG, or WEBP image.",
    imageSizeError: "Images must be 10 MB or smaller.",
    imageUploadError: "The image could not be uploaded. Please try another image.",
    imageOnlyPrompt: "Describe this image.",
    attachImage: "Attach image",
    removeImage: "Remove image",
    imagePreview: "Image preview",
    thinking: "Thinking…",
    auto: "Auto detect",
    english: "English",
    telugu: "తెలుగు",
    voiceReplies: "Read replies aloud",
    privacy: "Do not include patient identifiers or private health details in text or images.",
    ask: "Ask me anything!",
    micBlocked: "Microphone permission was denied.",
    micUnavailable: "Microphone is unavailable.",
    speechBusy: "Finish the active voice workflow before using the microphone.",
  },
  te: {
    title: "ఆరోగ్య సహాయకుడు",
    welcome: "నమస్కారం! ఆరోగ్య దృష్టి గురించి లేదా మరేదైనా అడగండి.",
    placeholder: "సందేశం టైప్ చేయండి…",
    send: "పంపండి",
    listening: "వింటున్నాను… మాట్లాడి ఆపండి",
    stopListening: "వినడం ఆపండి",
    startListening: "వాయిస్ ఇన్‌పుట్ ప్రారంభించండి",
    unavailable: "సహాయకుడు అందుబాటులో లేరు. మళ్లీ ప్రయత్నించండి.",
    voiceUnavailable: "మీ సందేశం పంపబడింది, కానీ వాయిస్ ప్లేబ్యాక్ అందుబాటులో లేదు.",
    imageTypeError: "JPEG, PNG లేదా WEBP చిత్రాన్ని ఎంచుకోండి.",
    imageSizeError: "చిత్రం పరిమాణం 10 MB లేదా అంతకంటే తక్కువగా ఉండాలి.",
    imageUploadError: "చిత్రాన్ని అప్‌లోడ్ చేయలేకపోయాము. మరొక చిత్రాన్ని ప్రయత్నించండి.",
    imageOnlyPrompt: "ఈ చిత్రాన్ని వివరించండి.",
    attachImage: "చిత్రాన్ని జోడించండి",
    removeImage: "చిత్రాన్ని తొలగించండి",
    imagePreview: "చిత్రం ప్రివ్యూ",
    thinking: "సమాధానం ఆలోచిస్తున్నాను…",
    auto: "భాష గుర్తించు",
    english: "English",
    telugu: "తెలుగు",
    voiceReplies: "సమాధానాన్ని వినిపించు",
    privacy: "సందేశాలు లేదా చిత్రాల్లో రోగి గుర్తింపు వివరాలు లేదా వ్యక్తిగత వైద్య సమాచారాన్ని చేర్చవద్దు.",
    ask: "నన్ను ఏదైనా అడగండి!",
    micBlocked: "మైక్రోఫోన్ అనుమతి నిరాకరించబడింది.",
    micUnavailable: "మైక్రోఫోన్ అందుబాటులో లేదు.",
    speechBusy: "మైక్రోఫోన్ ఉపయోగించడానికి ముందుగా ప్రస్తుత వాయిస్ ప్రక్రియను ముగించండి.",
  },
};

function detectReplyLocale(text, preference) {
  if (preference === "te" || preference === "en") return preference;
  return /[\u0C00-\u0C7F]/.test(text) ? "te" : "en";
}

export default function FloatingAssistant() {
  const { language: appLanguage } = useLanguage();
  const voice = useGlobalVoice();
  const [open, setOpen] = useState(false);
  const [mascotAvailable, setMascotAvailable] = useState(true);
  const [locale, setLocale] = useState("auto");
  const [voiceReplies, setVoiceReplies] = useState(true);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageError, setImageError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [micMessage, setMicMessage] = useState("");
  const scrollRef = useRef(null);
  const imageInputRef = useRef(null);
  const previewUrlsRef = useRef(new Set());
  const labelLocale = locale === "te" ? "te" : appLanguage === "te" ? "te" : "en";
  const copy = COPY[labelLocale];
  const speechLocale = normalizeSpeechLocale(locale === "auto" ? appLanguage : locale);
  const speech = useAzureSpeechRecognition({
    lang: speechLocale,
    enabled: open && voice.speechConfigured !== false,
  });
  const abortSpeech = speech.abort;

  const greeting = useMemo(() => ({
    role: "assistant",
    content: COPY[labelLocale].welcome,
  }), [labelLocale]);
  const visibleMessages = messages.length ? messages : [greeting];

  useEffect(() => {
    if (speech.transcript) {
      setDraft(speech.transcript);
      setMicMessage("");
    }
  }, [speech.transcript]);

  useEffect(() => {
    if (speech.errorKey === "voice.micDenied") setMicMessage(copy.micBlocked);
    else if (speech.errorKey === "voice.micUnavailable" || speech.errorKey === "voice.unsupported") {
      setMicMessage(copy.micUnavailable);
    }
  }, [copy.micBlocked, copy.micUnavailable, speech.errorKey]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, busy, open]);

  useEffect(() => () => {
    abortSpeech();
  }, [abortSpeech]);

  useEffect(() => () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const releaseUnsentPreview = (image) => {
    if (!image || messages.some((message) => message.imageUrl === image.previewUrl)) return;
    URL.revokeObjectURL(image.previewUrl);
    previewUrlsRef.current.delete(image.previewUrl);
  };

  const selectImage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setImageError("");
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      releaseUnsentPreview(selectedImage);
      setSelectedImage(null);
      setImageError(copy.imageTypeError);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      releaseUnsentPreview(selectedImage);
      setSelectedImage(null);
      setImageError(copy.imageSizeError);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    previewUrlsRef.current.add(previewUrl);
    releaseUnsentPreview(selectedImage);
    setSelectedImage({ file, previewUrl });
  };

  const removeSelectedImage = () => {
    releaseUnsentPreview(selectedImage);
    setSelectedImage(null);
    setImageError("");
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const toggleListening = async () => {
    setMicMessage("");
    if (speech.status === "listening") {
      speech.stop();
      return;
    }
    if (voice.sessionActive || voice.navListening) {
      setMicMessage(copy.speechBusy);
      return;
    }
    await speech.start();
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    const image = selectedImage;
    if ((!text && !image) || busy) return;
    const imageOnlyPrompt = locale === "te" || (locale === "auto" && appLanguage === "te")
      ? COPY.te.imageOnlyPrompt
      : COPY.en.imageOnlyPrompt;
    const userContent = text || imageOnlyPrompt;
    const nextMessages = [
      ...messages,
      {
        role: "user",
        content: userContent,
        ...(image ? { imageUrl: image.previewUrl } : {}),
      },
    ].slice(-10);
    const apiMessages = nextMessages.map(({ role, content }) => ({ role, content }));
    const requestLocale = locale === "auto" && !text && ["en", "te"].includes(appLanguage)
      ? appLanguage
      : locale;
    const replyLanguage = detectReplyLocale(text, requestLocale);
    setMessages(nextMessages);
    setDraft("");
    setSelectedImage(null);
    setImageError("");
    setError("");
    setBusy(true);

    try {
      let audioUnlocked = false;
      if (voiceReplies && voice.speechConfigured) {
        try {
          audioUnlocked = await unlockAzureAudio();
        } catch {
          audioUnlocked = false;
        }
      }

      let response;
      if (image) {
        const formData = new FormData();
        formData.append("messages", JSON.stringify(apiMessages));
        formData.append("locale", requestLocale);
        formData.append("image", image.file, image.file.name);
        response = await api.post("/assistant/chat", formData, { timeout: 180000 });
      } else {
        response = await api.post("/assistant/chat", {
          messages: apiMessages,
          locale: requestLocale,
        }, { timeout: 60000 });
      }
      const reply = String(response.data?.reply || "").trim();
      if (!reply
          || response.data?.model_information?.provider !== "cloudflare-workers-ai") {
        throw new Error("ASSISTANT_RESPONSE_INVALID");
      }
      const updatedMessages = [...nextMessages, { role: "assistant", content: reply }].slice(-12);
      setMessages(updatedMessages);
      if (voiceReplies && voice.speechConfigured && audioUnlocked) {
        voice.setPlaybackPhase("speaking");
        try {
          await speakAzureText(reply, { lang: normalizeSpeechLocale(replyLanguage) });
        } catch {
          setError(copy.voiceUnavailable);
        } finally {
          voice.setPlaybackPhase("idle");
        }
      }
    } catch (requestError) {
      const code = requestError?.response?.data?.code;
      if (code === "CHAT_IMAGE_TOO_LARGE" || requestError?.response?.status === 413) {
        setError(copy.imageSizeError);
      } else if (code === "CHAT_IMAGE_TYPE_UNSUPPORTED") {
        setError(copy.imageTypeError);
      } else if (code === "CHAT_IMAGE_INVALID") {
        setError(copy.imageUploadError);
      } else {
        setError(copy.unavailable);
      }
    } finally {
      setBusy(false);
    }
  };

  const closeAssistant = () => {
    if (speech.status === "listening") abortSpeech();
    setOpen(false);
  };

  return (
    <aside className="floating-assistant" aria-label={copy.title}>
      {open && (
        <section className="floating-assistant-panel" aria-label={copy.title}>
          <header className="floating-assistant-header">
            {mascotAvailable ? (
              <img
                className="floating-assistant-avatar"
                src={MASCOT_PATH}
                alt=""
                onError={() => setMascotAvailable(false)}
              />
            ) : <Bot size={23} aria-hidden="true" />}
            <div className="floating-assistant-heading">
              <strong>{copy.title}</strong>
              <span>{copy.privacy}</span>
            </div>
            <button type="button" className="floating-assistant-close" onClick={closeAssistant} aria-label="Close assistant">
              <X size={19} aria-hidden="true" />
            </button>
          </header>

          <div className="floating-assistant-options">
            <label>
              <span className="sr-only">Assistant language</span>
              <select value={locale} onChange={(event) => setLocale(event.target.value)}>
                <option value="auto">{copy.auto}</option>
                <option value="en">{copy.english}</option>
                <option value="te">{copy.telugu}</option>
              </select>
            </label>
            <button
              type="button"
              className={`floating-assistant-voice-toggle ${voiceReplies ? "is-on" : ""}`}
              onClick={() => setVoiceReplies((current) => !current)}
              aria-pressed={voiceReplies}
              title={copy.voiceReplies}
            >
              {voiceReplies ? <Volume2 size={16} /> : <VolumeX size={16} />}
              <span>{copy.voiceReplies}</span>
            </button>
          </div>

          <div className="floating-assistant-messages" ref={scrollRef} aria-live="polite">
            {visibleMessages.map((message, index) => (
              <p className={`floating-assistant-message ${message.role}`} key={`${index}-${message.role}`}>
                {message.imageUrl && (
                  <img className="floating-assistant-message-image" src={message.imageUrl} alt="User attachment" />
                )}
                {message.content}
              </p>
            ))}
            {busy && (
              <p className="floating-assistant-message assistant thinking">
                <LoaderCircle size={16} className="floating-assistant-spinner" aria-hidden="true" />
                {copy.thinking}
              </p>
            )}
          </div>

          {(error || imageError || micMessage || speech.errorKey) && (
            <p className="floating-assistant-error" role="status">
              {error || imageError || micMessage || (
                speech.errorKey === "voice.micDenied" ? copy.micBlocked : copy.micUnavailable
              )}
            </p>
          )}
          {speech.status === "listening" && (
            <p className="floating-assistant-listening" role="status">{copy.listening}</p>
          )}

          <form className="floating-assistant-compose" onSubmit={sendMessage}>
            {selectedImage && (
              <div className="floating-assistant-image-preview">
                <img src={selectedImage.previewUrl} alt={copy.imagePreview} />
                <button
                  type="button"
                  className="floating-assistant-image-remove"
                  onClick={removeSelectedImage}
                  aria-label={copy.removeImage}
                  title={copy.removeImage}
                  disabled={busy}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            )}
            <div className="floating-assistant-compose-controls">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={2000}
                rows={2}
                placeholder={copy.placeholder}
                aria-label={copy.placeholder}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <input
                ref={imageInputRef}
                className="floating-assistant-image-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                onChange={selectImage}
                tabIndex={-1}
                aria-hidden="true"
              />
              <button
                type="button"
                className="floating-assistant-action attach"
                onClick={() => imageInputRef.current?.click()}
                disabled={busy}
                aria-label={copy.attachImage}
                title={copy.attachImage}
              >
                <ImagePlus size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`floating-assistant-action mic ${speech.status === "listening" ? "is-listening" : ""}`}
                onClick={toggleListening}
                disabled={busy || voice.speechConfigured === false}
                aria-label={speech.status === "listening" ? copy.stopListening : copy.startListening}
                title={speech.status === "listening" ? copy.stopListening : copy.startListening}
              >
                {speech.status === "listening" ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <button
                type="submit"
                className="floating-assistant-action send"
                disabled={busy || (!draft.trim() && !selectedImage)}
                aria-label={copy.send}
                title={copy.send}
              >
                <Send size={18} />
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="floating-assistant-stack">
        {mascotAvailable && (
          <button
            type="button"
            className="floating-assistant-mascot-button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-label={open ? "Close Aarogya assistant" : "Open Aarogya assistant"}
            title={copy.ask}
          >
            <span className="floating-assistant-tooltip">{copy.ask}</span>
            <img
              className="floating-assistant-mascot"
              src={MASCOT_PATH}
              alt="Aarogya Drishti assistant"
              onError={() => setMascotAvailable(false)}
            />
          </button>
        )}
      </div>
    </aside>
  );
}
