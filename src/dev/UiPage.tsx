// Every primitive and element in the default (unthemed) style. "Preview theme" borrows a wiki's theme to compare.
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api.ts";
import { useResource } from "../lib/useResource.ts";
import { useTheme } from "../lib/useTheme.ts";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  ICON_NAMES,
  Icon,
  IconButton,
  Input,
  Kbd,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Segmented,
  Select,
  Separator,
  Surface,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
} from "../ui/index.ts";
import { Markdown } from "../wiki/markdown/Markdown.tsx";
import { SCREENS } from "./Screens.tsx";
import "./ui-page.css";

const SECTIONS = [
  ["tokens", "Tokens"],
  ["buttons", "Buttons"],
  ["fields", "Fields"],
  ["toggles", "Toggles"],
  ["badges", "Badges, keys, avatars"],
  ["callouts", "Callouts"],
  ["tabs", "Tabs"],
  ["overlays", "Overlays"],
  ["surfaces", "Surfaces"],
  ["icons", "Icons"],
  ["elements", "Page elements"],
  ["screens", "Screens"],
] as const;

const COLORS = ["bg", "surface", "raised", "border", "text", "muted", "accent", "accent-text"];

export function UiPage() {
  const wikis = useResource("wikis", api.wikis);
  const [preview, setPreview] = useState("default");
  const previewWiki = useResource(preview === "default" ? null : `wiki:${preview}`, () => api.wiki(preview));
  useTheme(preview === "default" ? undefined : previewWiki.data?.theme);
  const elements = useResource("elements", api.elements);

  return (
    <div className="ui-page">
      <nav className="ui-nav">
        <Link to="/" className="ui-back">
          <Icon name="arrowLeft" size={16} /> Deck
        </Link>
        <p className="ui-nav-title">Shiori UI</p>
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>
      <main className="ui-main">
        <header className="ui-head">
          <div>
            <h1>Primitives</h1>
            <p>The app's default look, before any wiki theme. Wikis only nudge these tokens.</p>
          </div>
          <Select
            label="Preview theme"
            value={preview}
            onChange={setPreview}
            options={[
              { value: "default", label: "Default theme" },
              ...(wikis.data ?? []).map((w) => ({ value: w.id, label: w.title })),
            ]}
          />
        </header>

        <Section id="tokens" title="Tokens">
          <div className="ui-swatches">
            {COLORS.map((c) => (
              <div key={c} className="ui-swatch">
                <span style={{ background: `var(--${c})` }} />
                <code>--{c}</code>
              </div>
            ))}
          </div>
          <Row label="Radius">
            {["sm", "md", "lg"].map((r) => (
              <div key={r} className="ui-radius" style={{ borderRadius: `var(--r-${r})` }}>
                --r-{r}
              </div>
            ))}
          </Row>
          <Row label="Shadow">
            {["1", "2"].map((s) => (
              <div key={s} className="ui-radius" style={{ boxShadow: `var(--shadow-${s})` }}>
                --shadow-{s}
              </div>
            ))}
          </Row>
          <Row label="Type">
            <div className="ui-type">
              <span style={{ fontSize: "var(--t-2xl)", fontFamily: "var(--font-heading)", fontWeight: 650 }}>
                Heading
              </span>
              <span style={{ fontSize: "var(--t-lg)" }}>Large body</span>
              <span>Body text, the default size.</span>
              <span style={{ fontSize: "var(--t-sm)", color: "var(--muted)" }}>Small muted text</span>
              <code style={{ fontFamily: "var(--font-mono)" }}>monospace 0123456789</code>
            </div>
          </Row>
        </Section>

        <Section id="buttons" title="Buttons">
          <Row label="Variants">
            <Button variant="solid">Solid</Button>
            <Button variant="soft">Soft</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
          </Row>
          <Row label="With icon">
            <Button variant="solid" icon="check">
              Resolve
            </Button>
            <Button icon="send">Reply</Button>
            <Button variant="ghost" icon="undo">
              Reopen
            </Button>
          </Row>
          <Row label="Small">
            <Button size="sm" variant="solid">
              Solid
            </Button>
            <Button size="sm">Soft</Button>
            <Button size="sm" variant="outline">
              Outline
            </Button>
            <Button size="sm" variant="ghost">
              Ghost
            </Button>
          </Row>
          <Row label="Icon only">
            <IconButton icon="menu" label="Menu" />
            <IconButton icon="comment" label="Comment" variant="soft" />
            <IconButton icon="close" label="Close" variant="outline" />
            <IconButton icon="check" label="Done" variant="solid" size="sm" />
          </Row>
          <Row label="Disabled">
            <Button variant="solid" disabled>
              Solid
            </Button>
            <Button disabled>Soft</Button>
          </Row>
        </Section>

        <Section id="fields" title="Fields">
          <div className="ui-fields">
            <Input placeholder="Input" />
            <Input defaultValue="With a value" />
            <Input placeholder="Disabled" disabled />
            <Textarea placeholder="Textarea" />
            <Select
              label="Select"
              value={undefined}
              onChange={() => {}}
              placeholder="Select…"
              options={[
                { value: "sword", label: "Sword" },
                { value: "dagger", label: "Dagger" },
                { value: "hammer", label: "Hammer" },
              ]}
            />
          </div>
        </Section>

        <Section id="toggles" title="Toggles">
          <ToggleDemo />
        </Section>

        <Section id="badges" title="Badges, keys and avatars">
          <Row label="Badge">
            <Badge>Neutral</Badge>
            <Badge tone="accent">Accent</Badge>
            <Badge tone="good">Good</Badge>
            <Badge tone="warn">Warn</Badge>
            <Badge tone="bad">Bad</Badge>
          </Row>
          <Row label="Key">
            <Kbd>Ctrl</Kbd> <Kbd>P</Kbd> <Kbd>Space</Kbd> <Kbd>LMB</Kbd>
          </Row>
          <Row label="Avatar">
            <Avatar id="host" name="Nari" host />
            <Avatar id="you" name="Mika Tanaka" ring />
            {["ren", "sol", "ivy", "oak", "kai", "zed"].map((id) => (
              <Avatar key={id} id={id} name={id} />
            ))}
          </Row>
        </Section>

        <Section id="callouts" title="Callouts">
          <Callout>A note, the default tone.</Callout>
          <Callout tone="tip" title="Tip">
            Callouts take an optional title.
          </Callout>
          <Callout tone="warning">Something to be careful about.</Callout>
          <Callout tone="danger" title="Danger">
            Something that will go wrong.
          </Callout>
        </Section>

        <Section id="tabs" title="Tabs">
          <Tabs
            items={[
              { value: "a", label: "Overview", content: <p>The first panel.</p> },
              { value: "b", label: "Stats", content: <p>The second panel.</p> },
              { value: "c", label: "Lore", content: <p>The third panel.</p> },
            ]}
          />
          <Row label="Segmented">
            <SegmentedDemo />
          </Row>
        </Section>

        <Section id="overlays" title="Overlays">
          <Row label="Floating">
            <Tooltip content="A tooltip">
              <Button>Hover me</Button>
            </Tooltip>
            <Popover>
              <PopoverTrigger asChild>
                <Button>Popover</Button>
              </PopoverTrigger>
              <PopoverContent>
                <p style={{ margin: "0 0 8px", fontWeight: 600 }}>A popover</p>
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "var(--t-sm)" }}>
                  Used by the comment composer.
                </p>
              </PopoverContent>
            </Popover>
            <Menu>
              <MenuTrigger asChild>
                <Button icon="dots">Menu</Button>
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>Thread</MenuLabel>
                <MenuItem icon="send">Reply</MenuItem>
                <MenuItem icon="check">Resolve</MenuItem>
                <MenuSeparator />
                <MenuItem icon="close" danger>
                  Won't fix
                </MenuItem>
              </MenuContent>
            </Menu>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="solid">Dialog</Button>
              </DialogTrigger>
              <DialogContent title="A dialog" description="For the rare moment that needs full attention.">
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <DialogClose asChild>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="solid">Confirm</Button>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>
          </Row>
        </Section>

        <Section id="surfaces" title="Surfaces">
          <div className="ui-surfaces">
            <Surface className="ui-surface">
              <strong>Surface</strong>
              <p>A raised panel for cards and floating content.</p>
            </Surface>
            <div className="ui-surface ui-plain">
              <strong>Plain</strong>
              <Separator />
              <p>With a separator.</p>
            </div>
          </div>
        </Section>

        <Section id="icons" title="Icons">
          <div className="ui-icons">
            {ICON_NAMES.map((name) => (
              <div key={name} className="ui-icon">
                <Icon name={name} size={22} />
                <code>{name}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section id="elements" title="Page elements">
          <p className="ui-note">
            Rendered from <code>docs/elements.md</code>, the reference agents follow.
          </p>
          <div className="sh-prose ui-elements">{elements.data && <Markdown hast={elements.data.hast} />}</div>
        </Section>

        <Section id="screens" title="Screens">
          <p className="ui-note">
            The app's special screens with sample data, each in a new tab. They render the real components.
          </p>
          <div className="ui-screens">
            {SCREENS.map((s) => (
              <a key={s.name} href={`/dev/screens/${s.name}`} target="_blank" rel="noreferrer" className="ui-screen">
                <span className="ui-screen-title">
                  {s.title}
                  <Icon name="arrowRight" size={14} />
                </span>
                <span className="ui-screen-what">{s.what}</span>
              </a>
            ))}
          </div>
        </Section>
      </main>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="ui-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ui-row">
      <span className="ui-row-label">{label}</span>
      <div className="ui-row-items">{children}</div>
    </div>
  );
}

function ToggleDemo() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  const [c, setC] = useState(true);
  return (
    <>
      <Row label="Switch">
        <Switch checked={a} onChange={setA}>
          Animations
        </Switch>
        <Switch checked={b} onChange={setB}>
          Reduced motion
        </Switch>
        <Switch checked={false} disabled>
          Disabled
        </Switch>
      </Row>
      <Row label="Checkbox">
        <Checkbox checked={c} onChange={setC}>
          Show resolved
        </Checkbox>
        <Checkbox checked={!c} onChange={(v) => setC(!v)}>
          Only mine
        </Checkbox>
        <Checkbox checked disabled>
          Disabled
        </Checkbox>
      </Row>
    </>
  );
}

function SegmentedDemo() {
  const [v, setV] = useState<"open" | "closed" | "all">("open");
  return (
    <Segmented
      value={v}
      onChange={setV}
      options={[
        { value: "open", label: "Open" },
        { value: "closed", label: "Closed" },
        { value: "all", label: "All" },
      ]}
    />
  );
}
