import "@testing-library/react";
import { vi } from "vitest";

// Mock Tauri's invoke so unit tests don't need a real Tauri runtime
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
