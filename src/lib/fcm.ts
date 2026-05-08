import { getMessaging, getToken, onMessage, isSupported, MessagePayload } from "firebase/messaging";
import { app } from "./firebase";
import firebaseConfig from "../../firebase-applet-config.json";

export const requestFcmToken = async (manualVapidKey?: string) => {
  try {
    if (!('serviceWorker' in navigator)) {
      throw new Error("Navegador não suporta Service Workers.");
    }

    const messagingSupported = await isSupported();
    if (!messagingSupported) {
      throw new Error("Firebase Messaging não é suportado neste ambiente.");
    }

    // 1. Permissões
    if (Notification.permission === 'denied') {
      throw new Error("Permissão de notificação negada.");
    }
    
    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error("Permissão negada pelo usuário.");
      }
    }

    const messaging = getMessaging(app);
    const vapidKey = manualVapidKey || import.meta.env.VITE_VAPID_PUBLIC_KEY || "BNZxtYsRCGDMr9lymhWNMQGrsCmyyCDS8qPsF61grmlykQ5jrch2Su83AWk3hZ45WP2FXf78ZGgYxp26pnm8jPo";

    // 2. Registro do Service Worker
    const swPath = '/firebase-messaging-sw.js';
    console.log("Registrando SW:", swPath);
    
    const registration = await navigator.serviceWorker.register(swPath, {
      scope: '/'
    });

    // Aguarda o Service Worker estar pronto
    const readyReg = await navigator.serviceWorker.ready;

    // 3. Obtenção do Token
    const token = await getToken(messaging, {
      vapidKey: vapidKey.trim(),
      serviceWorkerRegistration: readyReg,
    });

    if (token) {
      console.log("Token FCM obtido. Sincronizando...");
      
      const { auth } = await import("./firebase");
      const currentUserId = auth.currentUser?.uid || "user_" + Date.now();

      await fetch("/api/fcm-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, userId: currentUserId }),
      });
      
      return token;
    }
    return null;
  } catch (error: any) {
    console.error("Erro no FCM:", error);
    throw error;
  }
};

export const subscribeToMessages = (callback: (payload: MessagePayload) => void) => {
  try {
    const messaging = getMessaging(app);
    return onMessage(messaging, (payload) => {
      console.log("Mensagem recebida em foreground:", payload);
      callback(payload);
    });
  } catch (err) {
    console.error("Erro ao assinar mensagens:", err);
    return () => {};
  }
};

export const onMessageListener = () => {
  const messaging = getMessaging(app);
  return new Promise((resolve) => {
    onMessage(messaging, (payload) => resolve(payload));
  });
};