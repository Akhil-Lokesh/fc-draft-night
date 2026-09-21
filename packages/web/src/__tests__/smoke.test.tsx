import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../App.js";

test("app renders title", () => {
  render(<App />);
  expect(screen.getByText(/FC Draft Night/i)).toBeTruthy();
});
