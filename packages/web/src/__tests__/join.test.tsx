import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Join } from "../screens/Join.js";
import { TEAM_PALETTE } from "@fcdn/shared";

test("entering code + name + club and submitting calls join once", async () => {
  const join = vi.fn();
  render(<Join join={join} takenClubs={[]} />);
  await userEvent.type(screen.getByLabelText(/room code/i), "AB12");
  await userEvent.type(screen.getByLabelText(/name/i), "Ana");
  await userEvent.click(screen.getByRole("button", { name: /real madrid/i }));
  await userEvent.click(screen.getByRole("button", { name: /^join$/i }));
  expect(join).toHaveBeenCalledTimes(1);
  expect(join).toHaveBeenCalledWith({ code: "AB12", displayName: "Ana", clubId: "real" });
});

test("a code with no room says so under the field and blocks joining", async () => {
  const join = vi.fn();
  render(<Join join={join} takenClubs={[]} notFound />);
  await userEvent.type(screen.getByLabelText(/room code/i), "ZZZZZZ");
  await userEvent.type(screen.getByLabelText(/name/i), "Ana");
  await userEvent.click(screen.getByRole("button", { name: /real madrid/i }));
  expect(screen.getByText(/no room with that code/i)).toBeTruthy();
  expect(screen.getByRole("button", { name: /^join$/i })).toBeDisabled();
});

test("a taken club is disabled", () => {
  render(<Join join={() => {}} takenClubs={["real"]} />);
  expect(screen.getByRole("button", { name: /real madrid/i })).toBeDisabled();
});

test("a full room disables every club and blocks joining", () => {
  render(<Join join={() => {}} takenClubs={["real"]} capacity={1} managerCount={1} />);
  expect(screen.getByRole("button", { name: /real madrid/i })).toBeDisabled();
  expect(screen.getByRole("button", { name: /arsenal/i })).toBeDisabled();
  expect(screen.getByText(/room is full/i)).toBeTruthy();
});

test("a room built from an uploaded roster shows that room's clubs, not the built-in five", async () => {
  const join = vi.fn();
  render(
    <Join
      join={join}
      takenClubs={[]}
      clubs={[{ id: "chelsea", label: "Chelsea" }, { id: "atletico-madrid", label: "Atlético Madrid" }]}
    />
  );
  expect(screen.queryByRole("button", { name: /real madrid/i })).toBeNull();
  await userEvent.type(screen.getByLabelText(/room code/i), "AB12");
  await userEvent.type(screen.getByLabelText(/name/i), "Ana");
  await userEvent.click(screen.getByRole("button", { name: /chelsea/i }));
  await userEvent.click(screen.getByRole("button", { name: /^join$/i }));
  expect(join).toHaveBeenCalledWith({ code: "AB12", displayName: "Ana", clubId: "chelsea" });
});

test("each club in the picker shows its team colour — its slot in the room's club list", () => {
  render(<Join join={() => {}} takenClubs={[]} capacity={3} managerCount={0}
    clubs={[{ id: "as-roma", label: "AS Roma" }, { id: "psv", label: "PSV" }, { id: "fc-porto", label: "FC Porto" }]} />);
  const cards = [...document.querySelectorAll<HTMLElement>(".club-card")];
  expect(cards.map((c) => c.style.getPropertyValue("--club"))).toEqual(TEAM_PALETTE.slice(0, 3).map((c) => c.color));
});
