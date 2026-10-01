import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReportBlock } from "@apicem/api-contract";
import { renderPage } from "@/test/render";
import { BlockContent } from "./block-content";
import { builderActions, store, useAppSelector } from "@/store";

function imageBlock(config: Record<string, unknown> = {}): ReportBlock {
  return {
    id: "blk_image_1",
    type: "image",
    layout: { x: 0, y: 0, w: 4, h: 4 },
    config,
  };
}

/** Mirrors how BlockFrame actually renders a block: live from the store, so editing it (as the real app does via updateBlock) is reflected the same way here. */
function LiveBlock({ id }: { id: string }) {
  const block = useAppSelector((state) =>
    state.builder.blocks.find((item) => item.id === id),
  )!;
  return <BlockContent block={block} />;
}

describe("BlockContent — image block", () => {
  it("renders the actual image once a URL is set, in both edit and read-only mode", () => {
    const block = imageBlock({ url: "https://example.com/photo.png" });
    const { unmount, container } = renderPage(<BlockContent block={block} />);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/photo.png",
    );
    unmount();

    const { container: readOnlyContainer } = renderPage(
      <BlockContent block={block} readOnly />,
    );
    expect(readOnlyContainer.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/photo.png",
    );
  });

  it("prompts for a URL when editing an empty image block, and shows a plain empty state read-only", () => {
    const { unmount } = renderPage(<BlockContent block={imageBlock()} />);
    expect(
      screen.getByPlaceholderText("Paste an image URL…"),
    ).toBeInTheDocument();
    unmount();

    renderPage(<BlockContent block={imageBlock()} readOnly />);
    expect(
      screen.queryByPlaceholderText("Paste an image URL…"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("No image")).toBeInTheDocument();
  });

  it("keeps focus through every keystroke while typing a URL, even once an intermediate value briefly 404s", async () => {
    // Regression test: an earlier version swapped the input for a bare
    // <img> the moment the value was non-empty, so a partial, invalid URL
    // (just "h", "ht", ...) failed to load and remounted a fresh input on
    // every keystroke, silently dropping focus and truncating the typed
    // value down to whatever one character had landed before the remount.
    const user = userEvent.setup();
    const block = imageBlock();
    store.dispatch(
      builderActions.loadBuilder({ reportId: "rpt_test", blocks: [block] }),
    );

    const { container } = renderPage(<LiveBlock id={block.id} />);
    const input = screen.getByPlaceholderText("Paste an image URL…");
    await user.type(input, "https://example.com/chart.png");

    expect(input).toHaveValue("https://example.com/chart.png");
    expect(store.getState().builder.blocks[0].config).toMatchObject({
      url: "https://example.com/chart.png",
    });
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/chart.png",
    );
  });

  it("falls back to a broken-image state instead of a dead <img> when the URL fails to load", () => {
    const { container } = renderPage(
      <BlockContent
        block={imageBlock({ url: "https://example.com/missing.png" })}
        readOnly
      />,
    );

    fireEvent.error(container.querySelector("img")!);

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("Image failed to load")).toBeInTheDocument();
  });
});

describe("BlockContent — pivot block", () => {
  it("renders a real pivot table through the query engine, from a saved metricIds/rowDimensions/columnDimensions config", async () => {
    const block: ReportBlock = {
      id: "blk_pivot_1",
      type: "pivot",
      layout: { x: 0, y: 0, w: 8, h: 10 },
      config: {
        metricIds: ["met_revenue"],
        rowDimensions: ["channel"],
        title: "Revenue by channel",
      },
    };
    renderPage(<BlockContent block={block} />);

    expect(await screen.findByText("Revenue by channel")).toBeInTheDocument();
    expect(await screen.findByText("Meta Ads")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
  });
});
