import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "./AdminPage";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/components/AdminLineChart", () => ({ default: () => <div>Chart</div> }));

const openAdmin = () => render(<MemoryRouter><AdminPage /></MemoryRouter>);
beforeEach(() => { localStorage.clear(); mocks.invoke.mockReset(); });
afterEach(cleanup);

describe("remembered admin login", () => {
  it("restores a saved login without asking again, but waits for server validation", async () => {
    localStorage.setItem("lovable.admin.key", "test-only-key");
    let finish: ((value: unknown) => void) | undefined;
    mocks.invoke.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    openAdmin();
    expect(screen.queryByRole("button", { name: "Logga in" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(mocks.invoke).toHaveBeenCalledWith("admin-analytics", { headers: { "x-admin-key": "test-only-key" } });
    finish?.({ data: { days: [] }, error: null });
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
  });

  it("saves a successful login for subsequent visits", async () => {
    mocks.invoke.mockResolvedValue({ data: { days: [] }, error: null });
    const view = openAdmin();
    fireEvent.change(screen.getByLabelText("Adminnyckel"), { target: { value: "test-only-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    expect(localStorage.getItem("lovable.admin.key")).toBe("test-only-key");
    view.unmount();
    openAdmin();
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it("does not expose data when a saved key is rejected", async () => {
    localStorage.setItem("lovable.admin.key", "invalid-test-key");
    mocks.invoke.mockResolvedValue({ data: null, error: { message: "Unauthorized" } });
    openAdmin();
    await waitFor(() => expect(screen.getByRole("button", { name: "Logga in" })).toBeTruthy());
    expect(screen.queryByRole("table")).toBeNull();
    expect(localStorage.getItem("lovable.admin.key")).toBeNull();
    expect((screen.getByLabelText("Adminnyckel") as HTMLInputElement).value).toBe("");
    mocks.invoke.mockResolvedValue({ data: { days: [] }, error: null });
    fireEvent.change(screen.getByLabelText("Adminnyckel"), { target: { value: "corrected-test-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    expect(localStorage.getItem("lovable.admin.key")).toBe("corrected-test-key");
  });

  it("handles a server 401 and preserves saved login on temporary network errors", async () => {
    localStorage.setItem("lovable.admin.key", "test-only-key");
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { message: "Failed to send", context: undefined } });
    const view = openAdmin();
    await waitFor(() => expect(screen.getByRole("button", { name: "Logga in" })).toBeTruthy());
    expect(localStorage.getItem("lovable.admin.key")).toBe("test-only-key");
    view.unmount();
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { message: "Edge Function returned a non-2xx status code", context: { status: 401 } } });
    openAdmin();
    await waitFor(() => expect(screen.getByRole("button", { name: "Logga in" })).toBeTruthy());
    expect(localStorage.getItem("lovable.admin.key")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("forgets the saved login when explicitly logged out", async () => {
    localStorage.setItem("lovable.admin.key", "test-only-key");
    mocks.invoke.mockResolvedValue({ data: { days: [] }, error: null });
    const view = openAdmin();
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Logga ut" }));
    expect(localStorage.getItem("lovable.admin.key")).toBeNull();
    view.unmount();
    openAdmin();
    expect(screen.getByRole("button", { name: "Logga in" })).toBeTruthy();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});