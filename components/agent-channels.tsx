"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AgentChannel } from "@/lib/api-client";

// ---- Props ------------------------------------------------------------------

interface AgentChannelsProps {
  channels: AgentChannel[];
  onConnectWhatsApp: (phoneNumberId: string, accessToken: string) => Promise<{
    status: string;
    phoneNumberId: string;
  } | null>;
  onDisconnectWhatsApp: () => Promise<boolean>;
  onWhatsAppStatus: () => Promise<{
    status: string;
    phoneNumberId: string | null;
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
  const [waPhoneNumberId, setWaPhoneNumberId] = useState("");
  const [waAccessToken, setWaAccessToken] = useState("");
  const [waConnecting, setWaConnecting] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);

  // Telegram state
  const [tgToken, setTgToken] = useState("");
  const [tgConnecting, setTgConnecting] = useState(false);

  // Derived channel presence
  const waChannel = channels.find((c) => c.channel_type === "whatsapp");
  const tgChannel = channels.find((c) => c.channel_type === "telegram");

  // ---- WhatsApp handlers ----------------------------------------------------

  const handleConnectWhatsApp = useCallback(async () => {
    if (!waPhoneNumberId.trim() || !waAccessToken.trim()) return;
    setWaConnecting(true);
    setWaError(null);

    const result = await onConnectWhatsApp(
      waPhoneNumberId.trim(),
      waAccessToken.trim(),
    );

    if (!result) {
      setWaError("Failed to connect. Check your credentials and try again.");
    } else {
      setWaPhoneNumberId("");
      setWaAccessToken("");
    }

    setWaConnecting(false);
  }, [waPhoneNumberId, waAccessToken, onConnectWhatsApp]);

  const handleDisconnectWhatsApp = useCallback(async () => {
    const ok = await onDisconnectWhatsApp();
    if (ok) {
      setWaPhoneNumberId("");
      setWaAccessToken("");
      setWaError(null);
    }
  }, [onDisconnectWhatsApp]);

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
    <div className="space-y-5">
      {/* WhatsApp section */}
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              WhatsApp
            </h4>
            <p className="text-xs text-muted-foreground">
              Connect using the official Meta Cloud API.
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

        {waChannel?.is_active ? (
          <div className="space-y-2">
            {waChannel.config && (
              <p className="text-xs text-muted-foreground">
                Phone Number ID:{" "}
                {String(
                  (waChannel.config as Record<string, unknown>)
                    .phone_number_id ?? "unknown",
                )}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnectWhatsApp}
                disabled={isOperating}
                className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                Disconnect
              </Button>
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
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <input
                type="text"
                value={waPhoneNumberId}
                onChange={(e) => setWaPhoneNumberId(e.target.value)}
                placeholder="Phone Number ID (from Meta Business)"
                className="h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs
                           placeholder:text-muted-foreground/50
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={isOperating || waConnecting}
              />
              <input
                type="password"
                value={waAccessToken}
                onChange={(e) => setWaAccessToken(e.target.value)}
                placeholder="Access Token"
                className="h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs
                           placeholder:text-muted-foreground/50
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={isOperating || waConnecting}
              />
            </div>

            {waError && (
              <p className="text-xs text-destructive">{waError}</p>
            )}

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleConnectWhatsApp}
                disabled={
                  isOperating ||
                  waConnecting ||
                  !waPhoneNumberId.trim() ||
                  !waAccessToken.trim()
                }
              >
                {waConnecting ? "Connecting…" : waChannel ? "Connect" : "Set up WhatsApp"}
              </Button>
              {waChannel && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveChannel(waChannel.id)}
                  disabled={isOperating}
                  className="text-muted-foreground"
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
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
  );
}
