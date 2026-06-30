#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = "https://bair1.live";
const API_KEY = process.env.BAIR1_API_KEY || "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch(path: string): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (API_KEY) {
    headers["x-api-key"] = API_KEY;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bair1 API error ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

function formatAqi(pm25: number): { aqi: string; level: string; advice: string } {
  if (pm25 <= 12) return { aqi: "Good (0-50)", level: "Good", advice: "Air quality is satisfactory. No health risk." };
  if (pm25 <= 35.4) return { aqi: "Moderate (51-100)", level: "Moderate", advice: "Acceptable. Sensitive individuals should limit prolonged outdoor exertion." };
  if (pm25 <= 55.4) return { aqi: "Unhealthy for Sensitive Groups (101-150)", level: "USG", advice: "People with respiratory or heart conditions, children, and older adults should reduce prolonged outdoor exertion." };
  if (pm25 <= 150.4) return { aqi: "Unhealthy (151-200)", level: "Unhealthy", advice: "Everyone may begin to experience health effects. Sensitive groups should avoid outdoor exertion." };
  if (pm25 <= 250.4) return { aqi: "Very Unhealthy (201-300)", level: "Very Unhealthy", advice: "Health alert: everyone may experience serious health effects. Avoid outdoor activities." };
  return { aqi: "Hazardous (301+)", level: "Hazardous", advice: "Health emergency. Everyone should avoid all outdoor activity." };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "bair1",
  version: "1.0.0",
});

// --- Tool: get_latest_reading ------------------------------------------------

server.tool(
  "get_latest_reading",
  "Get the most recent air quality reading from a Bair1 sensor",
  {
    device_id: z.string().optional().describe("Optional device ID to filter by"),
  },
  async ({ device_id }) => {
    const path = device_id
      ? `/api/v1/devices/${encodeURIComponent(device_id)}/readings?limit=1`
      : `/api/readings/latest`;
    const data = await apiFetch(path);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
);

// --- Tool: list_devices ------------------------------------------------------

server.tool(
  "list_devices",
  "List all registered Bair1 air quality sensors",
  {},
  async () => {
    const data = await apiFetch("/api/v1/devices");
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
);

// --- Tool: get_readings ------------------------------------------------------

server.tool(
  "get_readings",
  "Get historical air quality readings for a specific device",
  {
    device_id: z.string().describe("The device ID to fetch readings for"),
    limit: z.number().optional().default(20).describe("Number of readings to return (default 20)"),
  },
  async ({ device_id, limit }) => {
    const data = await apiFetch(
      `/api/v1/devices/${encodeURIComponent(device_id)}/readings?limit=${limit}`,
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
);

// --- Tool: get_air_quality_summary -------------------------------------------

server.tool(
  "get_air_quality_summary",
  "Get a human-readable air quality summary with AQI, PM levels, and health advice",
  {
    device_id: z.string().optional().describe("Optional device ID to summarise"),
  },
  async ({ device_id }) => {
    const path = device_id
      ? `/api/v1/devices/${encodeURIComponent(device_id)}/readings?limit=1`
      : `/api/readings/latest`;

    const raw = await apiFetch(path);

    // Try to extract the reading — the API may return an object or an array
    let reading: Record<string, unknown>;
    if (Array.isArray(raw)) {
      if (raw.length === 0) {
        return { content: [{ type: "text" as const, text: "No readings available." }] };
      }
      reading = raw[0] as Record<string, unknown>;
    } else if (raw && typeof raw === "object" && "readings" in (raw as Record<string, unknown>)) {
      const arr = (raw as Record<string, unknown>).readings;
      if (Array.isArray(arr) && arr.length > 0) {
        reading = arr[0] as Record<string, unknown>;
      } else {
        return { content: [{ type: "text" as const, text: "No readings available." }] };
      }
    } else {
      reading = raw as Record<string, unknown>;
    }

    const pm25 = Number(reading.pm25 ?? reading.pm2_5 ?? reading.PM25 ?? 0);
    const pm10 = Number(reading.pm10 ?? reading.PM10 ?? 0);
    const pm1 = Number(reading.pm1 ?? reading.PM1 ?? 0);
    const temperature = reading.temperature ?? reading.temp ?? "N/A";
    const humidity = reading.humidity ?? reading.hum ?? "N/A";
    const timestamp = reading.timestamp ?? reading.created_at ?? reading.time ?? "unknown";
    const deviceLabel = reading.device_id ?? reading.deviceId ?? device_id ?? "default";

    const { aqi, level, advice } = formatAqi(pm25);

    const summary = [
      `--- Bair1 Air Quality Summary ---`,
      `Device:       ${deviceLabel}`,
      `Timestamp:    ${timestamp}`,
      ``,
      `PM1.0:        ${pm1} ug/m3`,
      `PM2.5:        ${pm25} ug/m3`,
      `PM10:         ${pm10} ug/m3`,
      `Temperature:  ${temperature}`,
      `Humidity:     ${humidity}`,
      ``,
      `AQI Category: ${aqi}`,
      `Air State:    ${level}`,
      ``,
      `Health Advice: ${advice}`,
    ].join("\n");

    return { content: [{ type: "text" as const, text: summary }] };
  },
);

// --- Tool: export_data -------------------------------------------------------

server.tool(
  "export_data",
  "Export air quality readings as JSON for a given device and time range",
  {
    device_id: z.string().describe("The device ID to export data for"),
    from: z.string().optional().describe("Start date in ISO 8601 format (e.g. 2025-01-01T00:00:00Z)"),
    to: z.string().optional().describe("End date in ISO 8601 format"),
    limit: z.number().optional().describe("Max number of records to export"),
  },
  async ({ device_id, from, to, limit }) => {
    const params = new URLSearchParams({
      format: "json",
      device_id: device_id,
    });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (limit !== undefined) params.set("limit", String(limit));

    const data = await apiFetch(`/api/v1/export?${params.toString()}`);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Bair1 MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
