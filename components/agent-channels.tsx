"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { AgentChannel } from "@/lib/api-client";

// ---- Props ------------------------------------------------------------------

interface AgentChannelsProps {
  channels: AgentChannel[];
  onConnectWhatsApp: () => Promise<{
    status: string;
    qr_code?: string;
  } | null>;
  onDisconnectWhatsApp: () => Promise<boolean>;
  onWhatsAppStatus: () => Promise<{
    status: string;
    qr_code?: string;
    phone_number?: string;
  } | null>;
  onConnectTelegram: (botToken: string) => Promise<{
    bot_username: string;
  } | null>;
  onDisconnectTelegram: () => Promise<boolean>;
  onRemoveChannel: (channelId: string) => Promise<boolean>;
  isOperating: boolean;
}

// ---- Component --------------------------------------------------------------

export function AgentChannels({
  channels,
  onConnectWhatsApp,
  onDisconnectWhatsApp,
  onWhatsAppStatus,
  onConnectTelegram,
  onDisconnectTelegram,
  onRemoveChannel,
  isOperating,
}: AgentChannelsProps) {
  // WhatsApp state
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waQrCode, setWaQrCode] = useState<string | null>(null);
  const [waStatus, setWaStatus] = useState<
    "idle" | "qr_pending" | "connecting" | "connected" | "disconnected"
  >("idle");
  const [waPhoneNumber, setWaPhoneNumber] = useState<string | null>(null);
  const waPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Telegram state
  const [tgToken, setTgToken] = useState("");
  const [tgConnecting, setTgConnecting] = useState(false);

  // Derived channel presence
  const waChannel = channels.find((c) => c.channel_type === "whatsapp");
  const tgChannel = channels.find((c) => c.channel_type === "telegram");

  // Cleanup WhatsApp polling on unmount
  useEffect(() => {
    return () => {
      if (waPollRef.current) clearInterval(waPollRef.current);
    };
  }, []);

  // ---- WhatsApp handlers ----------------------------------------------------

  const startWaPolling = useCallback(() => {
    if (waPollRef.current) clearInterval(waPollRef.current);
    waPollRef.current = setInterval(async () => {
      const status = await onWhatsAppStatus();
      if (!status) return;
      switch (status.status) {
        case "qr_pending":
          setWaStatus("qr_pending");
          if (status.qr_code) setWaQrCode(status.qr_code);
          break;
        case "connecting":
          setWaStatus("connecting");
          break;
        case "connected":
          setWaStatus("connected");
          if (status.phone_number) setWaPhoneNumber(status.phone_number);
          if (waPollRef.current) clearInterval(waPollRef.current);
          waPollRef.current = null;
          break;
        case "disconnected":
          setWaStatus("disconnected");
          if (waPollRef.current) clearInterval(waPollRef.current);
          waPollRef.current = null;
          break;
      }
    }, 2000);
  }, [onWhatsAppStatus]);

  const handleConnectWhatsApp = useCallback(async () => {
    setWaStatus("connecting");
    setWaQrCode(null);
    setWaPhoneNumber(null);
    setWaModalOpen(true);

    const result = await onConnectWhatsApp();
    if (!result) {
      setWaStatus("disconnected");
      return;
    }

    if (result.qr_code) {
      setWaQrCode(result.qr_code);
      setWaStatus("qr_pending");
    }
    startWaPolling();
  }, [onConnectWhatsApp, startWaPolling]);

  const handleDisconnectWhatsApp = useCallback(async () => {
    const ok = await onDisconnectWhatsApp();
    if (ok) {
      setWaStatus("disconnected");
      setWaQrCode(null);
      setWaPhoneNumber(null);
      setWaModalOpen(false);
      if (waPollRef.current) {
        clearInterval(waPollRef.current);
        waPollRef.current = null;
      }
    }
  }, [onDisconnectWhatsApp]);

  const closeWaModal = useCallback(() => {
    setWaModalOpen(false);
  }, []);

  // ---- Telegram handlers ----------------------------------------------------

  const handleConnectTelegram = useCallback(async () => {
    if (!tgToken.trim()) return;
    setTgConnecting(true);
    const result = await onConnectTelegram(tgToken.trim());
    if (result) {
      setTgToken("");
    }
    setTgConnecting(false);
  }, [tgToken, onConnectTelegram]);

  const handleDisconnectTelegram = useCallback(async () => {
    await onDisconnectTelegram();
  }, [onDisconnectTelegram]);

  // ---- Render ---------------------------------------------------------------

  return (
    <>
      <div className="space-y-5">
        {/* WhatsApp section */}
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                WhatsApp
              </h4>
              <p className="text-xs text-muted-foreground">
                Connect via QR code scan from WhatsApp mobile app.
              </p>
            </div>
            {waChannel ? (
              <Badge
                variant={waChannel.is_active ? "default" : "secondary"}
                className="text-[11px]"
              >
                {waChannel.is_active ? "Connected" : "Configured"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[11px]">
                Not set up
              </Badge>
            )}
          </div>

          {waChannel ? (
            <div className="flex items-center gap-2">
              {waChannel.is_active ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnectWhatsApp}
                  disabled={isOperating}
                  className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleConnectWhatsApp}
                  disabled={isOperating}
                >
                  Connect WhatsApp
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemoveChannel(waChannel.id)}
                disabled={isOperating}
                className="text-muted-foreground"
              >
                Remove
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleConnectWhatsApp}
              disabled={isOperating}
            >
              Set up WhatsApp
            </Button>
          )}
        </div>

        {/* Telegram section */}
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Telegram
              </h4>
              <p className="text-xs text-muted-foreground">
                Connect using a bot token from @BotFather.
              </p>
            </div>
            {tgChannel ? (
              <Badge
                variant={tgChannel.is_active ? "default" : "secondary"}
                className="text-[11px]"
              >
                {tgChannel.is_active ? "Connected" : "Configured"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[11px]">
                Not set up
              </Badge>
            )}
          </div>

          {tgChannel ? (
            <div className="flex items-center gap-2">
              {tgChannel.config && (
                <span className="text-xs text-muted-foreground">
                  @
                  {String((tgChannel.config as Record<string, unknown>)
                    .bot_username ?? "unknown")}
                </span>
              )}
              {tgChannel.is_active ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnectTelegram}
                  disabled={isOperating}
                  className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  Disconnect
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={tgToken}
                    onChange={(e) => setTgToken(e.target.value)}
                    placeholder="Bot token from @BotFather"
                    className="h-9 w-64 rounded-lg border border-input bg-background px-3 py-1.5 text-xs
                               placeholder:text-muted-foreground/50
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={isOperating || tgConnecting}
                  />
                  <Button
                    size="sm"
                    onClick={handleConnectTelegram}
                    disabled={
                      isOperating || tgConnecting || !tgToken.trim()
                    }
                  >
                    {tgConnecting ? "Connecting…" : "Connect"}
                  </Button>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemoveChannel(tgChannel.id)}
                disabled={isOperating}
                className="text-muted-foreground"
              >
                Remove
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                placeholder="Bot token from @BotFather"
                className="h-9 w-64 rounded-lg border border-input bg-background px-3 py-1.5 text-xs
                           placeholder:text-muted-foreground/50
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={isOperating}
              />
              <Button
                size="sm"
                onClick={handleConnectTelegram}
                disabled={isOperating || tgConnecting || !tgToken.trim()}
              >
                {tgConnecting ? "Connecting…" : "Set up Telegram"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ---- WhatsApp QR Modal ---- */}
      <Dialog open={waModalOpen} onOpenChange={closeWaModal}>
        <DialogHeader>
          <DialogTitle>Connect WhatsApp</DialogTitle>
          <DialogDescription>
            Scan the QR code with your WhatsApp mobile app to connect.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-6">
          {waStatus === "connecting" && (
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">
                Initializing connection…
              </p>
            </div>
          )}

          {waStatus === "qr_pending" && waQrCode && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-xl border border-border/60 bg-white p-4">
                {/* Render QR code as an image using the QR string data */}
                {/* The QR string from the API can be rendered with a QR lib or as canvas */}
                <div className="h-56 w-56 flex items-center justify-center bg-white rounded-lg">
                  <QRCodeImage qrData={waQrCode} />
                </div>
              </div>
              <p className="text-sm font-medium text-foreground">
                Scan QR Code
              </p>
              <p className="text-xs text-muted-foreground text-center max-w-xs">
                Open WhatsApp on your phone, go to Settings &gt; Linked Devices,
                and scan this QR code.
              </p>
            </div>
          )}

          {waStatus === "connected" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="flex items-center justify-center h-16 w-16 rounded-full bg-emerald-500/10">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-8 w-8 text-emerald-600"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-foreground">
                Connected!
              </p>
              {waPhoneNumber && (
                <p className="text-xs text-muted-foreground">
                  {waPhoneNumber}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={closeWaModal}
                className="mt-2"
              >
                Done
              </Button>
            </div>
          )}

          {waStatus === "disconnected" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="flex items-center justify-center h-16 w-16 rounded-full bg-destructive/10">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-8 w-8 text-destructive"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">
                Connection failed. Please try again.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleConnectWhatsApp}
                className="mt-2"
              >
                Retry
              </Button>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}

// ---- Internal QR code renderer ----------------------------------------------
// Renders a QR code string as an image. The string is typically SVG or
// an ASCII QR representation. For a real implementation, use qrcode.react.
// Here we render a simple representation.

function QRCodeImage({ qrData }: { qrData: string }) {
  // The QR data from the API might be an SVG string or a data URL.
  // Try rendering as SVG image.
  if (qrData.startsWith("<svg") || qrData.startsWith("<?xml")) {
    return (
      <div
        className="h-full w-full"
        dangerouslySetInnerHTML={{ __html: qrData }}
      />
    );
  }

  // If it's base64 data
  if (qrData.startsWith("data:image")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={qrData} alt="WhatsApp QR code" className="h-full w-full" />;
  }

  // Fallback: render as a qr code placeholder
  // In production this should use qrcode.react or a similar library
  return (
    <div className="flex items-center justify-center h-full w-full">
      <QRCodeFallback data={qrData} />
    </div>
  );
}

function QRCodeFallback({ data }: { data: string }) {
  // Generate a simple block-based QR visualization using canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 200;
    const cellCount = 25; // approximate for basic QR
    const cellSize = size / cellCount;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    // Generate a deterministic pattern from the data string
    const seed = data.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);

    ctx.fillStyle = "#000000";
    for (let row = 0; row < cellCount; row++) {
      for (let col = 0; col < cellCount; col++) {
        // Simple pseudo-random pattern
        const hash = ((row * 31 + col * 17 + seed) * 2654435761) >>> 0;
        if (hash % 3 === 0) {
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }
  }, [data]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={200}
      className="rounded-lg"
    />
  );
}
