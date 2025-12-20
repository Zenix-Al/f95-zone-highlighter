import { config, state } from "../constants";

export function wideForum() {
  if (!state.isThread) return;
  const isWide = !!config.threadSettings.isWide;

  document
    .querySelectorAll(".p-body-inner")
    .forEach((el) => el.classList.toggle("no-max-width", isWide));
}
