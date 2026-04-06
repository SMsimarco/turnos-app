// notify-booking — deshabilitada intencionalmente.
// El admin ve todas las reservas desde el panel.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
serve(() => new Response("OK", { status: 200 }));
