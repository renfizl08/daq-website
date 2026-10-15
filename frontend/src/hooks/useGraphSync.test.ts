import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSharedGraphs, saveSharedGraphs } from "../api/datasets";
import { useGraphSync } from "./useGraphSync";

vi.mock("../api/datasets", () => ({
  getSharedGraphs: vi.fn(),
  saveSharedGraphs: vi.fn(),
}));

const remote = [{ id: 1, name: "Shared" }];
const local = [{ id: 1, name: "Mine" }];

describe("useGraphSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(getSharedGraphs).mockResolvedValue({
      graphs: remote,
      updated_at: "now",
    });
    vi.mocked(saveSharedGraphs).mockResolvedValue({
      graphs: [],
      updated_at: "now",
    });
  });

  it("adopts the shared graphs in a fresh browser without pushing", async () => {
    const { result } = renderHook(() => {
      const [items, setItems] = useState<unknown[]>([]);
      return {
        items,
        status: useGraphSync("run", items, "pw", setItems),
      };
    });
    await waitFor(() => expect(result.current.items).toEqual(remote));
    await waitFor(() => expect(result.current.status).toBe("shared"));
    expect(saveSharedGraphs).not.toHaveBeenCalled();
  });

  it("keeps unsynced local edits and stays local without a password", async () => {
    localStorage.setItem("daq-graphs-run", JSON.stringify(local));
    const onRemote = vi.fn();
    const { result } = renderHook(() =>
      useGraphSync("run", local, "", onRemote),
    );
    await waitFor(() => expect(getSharedGraphs).toHaveBeenCalled());
    await act(async () => undefined);
    expect(onRemote).not.toHaveBeenCalled();
    expect(saveSharedGraphs).not.toHaveBeenCalled();
    expect(result.current).toBe("local");
  });

  it("pushes local edits once the password is entered", async () => {
    localStorage.setItem("daq-graphs-run", JSON.stringify(local));
    const { result, rerender } = renderHook(
      ({ password }) => useGraphSync("run", local, password, vi.fn()),
      { initialProps: { password: "" } },
    );
    await act(async () => undefined);
    rerender({ password: "pw" });
    await waitFor(() =>
      expect(saveSharedGraphs).toHaveBeenCalledWith("run", local, "pw"),
    );
    await waitFor(() => expect(result.current).toBe("shared"));
  });

  it("reports a failed save", async () => {
    localStorage.setItem("daq-graphs-run", JSON.stringify(local));
    vi.mocked(saveSharedGraphs).mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() =>
      useGraphSync("run", local, "pw", vi.fn()),
    );
    await waitFor(() => expect(result.current).toBe("error"));
  });
});
