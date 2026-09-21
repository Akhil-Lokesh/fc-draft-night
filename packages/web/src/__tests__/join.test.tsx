import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Join } from "../screens/Join.js";

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

test("a taken club is disabled", () => {
  render(<Join join={() => {}} takenClubs={["real"]} />);
  expect(screen.getByRole("button", { name: /real madrid/i })).toBeDisabled();
});
