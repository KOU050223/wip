import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import TitlePage from "./TitlePage";

describe("TitlePage", () => {
  it("スター・ウォーズ風ロゴ用の見出しクラスを表示する", () => {
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(TitlePage)),
    );

    expect(markup).toContain('class="title-logo title-logo--bold-outline title-flicker"');
  });
});
