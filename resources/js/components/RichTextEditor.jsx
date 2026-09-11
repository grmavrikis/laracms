import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import {
    Heading1, Heading2, Heading3, Pilcrow,
    Bold, Italic, Strikethrough, Highlighter,
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
} from 'lucide-react';
import { emptyDoc } from '../lib/richText';
import { t } from '../lib/i18n';

/**
 * One toolbar control.
 *
 * **`aria-pressed`, not only a background colour.** Whether the selection is
 * bold was information a sighted reader had and nobody else - the same defect
 * the entry form's language tabs carried until #117's review round. `label`
 * does the other two jobs an icon cannot do for itself: it names the button in
 * the accessibility tree and gives a pointer user a tooltip.
 */
const Control = ({ icon: Icon, label, active, onClick, ...rest }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        title={label}
        {...rest}
        className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent ${
            active
                ? 'bg-accent text-accent-fg'
                : 'text-fg-muted hover:bg-surface hover:text-fg'
        }`}
    >
        <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
);

const Divider = () => <div className="mx-1 w-px self-stretch bg-line-strong" aria-hidden="true" />;

/**
 * A toolbar is **one tab stop**, and the arrow keys move inside it.
 *
 * That is what `role="toolbar"` promises, and declaring the role without it is
 * worse than using no role at all: the reader is told to press arrows, nothing
 * happens, and Tab now costs twelve presses to get past the formatting into the
 * text they came to write. The ARIA pattern's name for this is a roving
 * tabindex - exactly one control is reachable by Tab, and it is the one the
 * person last used rather than always the first.
 *
 * The hook holds the index and hands each control its `tabIndex` and key
 * handler; the refs are how focus actually moves, since the buttons are
 * ordinary DOM nodes and nothing else tracks them.
 */
/**
 * How many controls the toolbar draws, which the roving focus needs before any
 * of them has rendered. `RichTextEditor.test.jsx` asserts the toolbar's actual
 * button count against this, so a thirteenth control cannot be added without
 * the wrap and the End key quietly losing it.
 */
export const CONTROL_COUNT = 12;

const useRovingFocus = (count) => {
    const [current, setCurrent] = useState(0);
    const refs = useRef([]);

    const focusAt = (next) => {
        // Wraps at both ends, so the last control is one press from the first
        // and arrowing never dead-ends.
        const index = (next + count) % count;

        setCurrent(index);
        refs.current[index]?.focus();
    };

    const KEYS = {
        ArrowRight: (i) => i + 1,
        ArrowDown: (i) => i + 1,
        ArrowLeft: (i) => i - 1,
        ArrowUp: (i) => i - 1,
        Home: () => 0,
        End: () => count - 1,
    };

    return (index) => ({
        tabIndex: index === current ? 0 : -1,
        ref: (node) => { refs.current[index] = node; },
        onKeyDown: (event) => {
            const move = KEYS[event.key];

            if (!move) return;

            // The browser would otherwise scroll the page on an arrow press.
            event.preventDefault();
            focusAt(move(index));
        },
        // A pointer user can start anywhere; the tab stop follows them.
        onFocus: () => setCurrent(index),
    });
};

const MenuBar = ({ editor }) => {
    const editorState = useEditorState({
        editor,
        selector: ctx => ({
            isBold: ctx.editor.isActive('bold') ?? false,
            isItalic: ctx.editor.isActive('italic') ?? false,
            isStrike: ctx.editor.isActive('strike') ?? false,
            isHighlight: ctx.editor.isActive('highlight') ?? false,
            isAlignLeft: ctx.editor.isActive({ textAlign: 'left' }) ?? false,
            isAlignCenter: ctx.editor.isActive({ textAlign: 'center' }) ?? false,
            isAlignRight: ctx.editor.isActive({ textAlign: 'right' }) ?? false,
            isAlignJustify: ctx.editor.isActive({ textAlign: 'justify' }) ?? false,
            isParagraph: ctx.editor.isActive('paragraph') ?? false,
            isHeading1: ctx.editor.isActive('heading', { level: 1 }) ?? false,
            isHeading2: ctx.editor.isActive('heading', { level: 2 }) ?? false,
            isHeading3: ctx.editor.isActive('heading', { level: 3 }) ?? false,
        }),
    });

    if (!editor) return null;

    const chain = () => editor.chain().focus();
    const roving = useRovingFocus(CONTROL_COUNT);

    return (
        // `toolbar`, because these are controls over one editor rather than
        // twelve unrelated buttons that happen to sit above a box.
        <div
            role="toolbar"
            aria-label={t('Formatting')}
            className="mb-2 flex flex-wrap items-center gap-0.5 rounded-lg border border-line bg-surface-muted p-1.5"
        >
            <Control icon={Heading1} label={t('Heading 1')} active={editorState.isHeading1} onClick={() => chain().toggleHeading({ level: 1 }).run()} {...roving(0)} />
            <Control icon={Heading2} label={t('Heading 2')} active={editorState.isHeading2} onClick={() => chain().toggleHeading({ level: 2 }).run()} {...roving(1)} />
            <Control icon={Heading3} label={t('Heading 3')} active={editorState.isHeading3} onClick={() => chain().toggleHeading({ level: 3 }).run()} {...roving(2)} />
            <Control icon={Pilcrow} label={t('Paragraph')} active={editorState.isParagraph} onClick={() => chain().setParagraph().run()} {...roving(3)} />

            <Divider />

            <Control icon={Bold} label={t('Bold')} active={editorState.isBold} onClick={() => chain().toggleBold().run()} {...roving(4)} />
            <Control icon={Italic} label={t('Italic')} active={editorState.isItalic} onClick={() => chain().toggleItalic().run()} {...roving(5)} />
            <Control icon={Strikethrough} label={t('Strikethrough')} active={editorState.isStrike} onClick={() => chain().toggleStrike().run()} {...roving(6)} />
            <Control icon={Highlighter} label={t('Highlight')} active={editorState.isHighlight} onClick={() => chain().toggleHighlight().run()} {...roving(7)} />

            <Divider />

            <Control icon={AlignLeft} label={t('Left')} active={editorState.isAlignLeft} onClick={() => chain().setTextAlign('left').run()} {...roving(8)} />
            <Control icon={AlignCenter} label={t('Center')} active={editorState.isAlignCenter} onClick={() => chain().setTextAlign('center').run()} {...roving(9)} />
            <Control icon={AlignRight} label={t('Right')} active={editorState.isAlignRight} onClick={() => chain().setTextAlign('right').run()} {...roving(10)} />
            <Control icon={AlignJustify} label={t('Justify')} active={editorState.isAlignJustify} onClick={() => chain().setTextAlign('justify').run()} {...roving(11)} />
        </div>
    );
};

export default function RichTextEditor({ value, onChange }) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Highlight,
        ],
        content: value ?? emptyDoc(),
        onUpdate: ({ editor }) => {
            // The document tree goes to EntryForm state, not an HTML string:
            // it is stored and re-rendered structurally, never as raw markup.
            onChange(editor.getJSON());
        },
        editorProps: {
            attributes: {
                // `prose` for the type scale and list markers; its colours are
                // re-pointed at the panel's tokens in `app.css`, because the
                // plugin's own are fixed grays that measured 2.01:1 on the dark
                // surface - everything a client had written, nearly invisible.
                class: 'prose max-w-none rounded-lg border border-line bg-surface p-4 min-h-[200px] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent tiptap-editor',
            },
        },
    });

    // Synchronize external value changes (e.g., when editing an existing entry).
    // Compared by value, since getJSON() returns a fresh object every call.
    useEffect(() => {
        if (!editor) return;

        const incoming = value ?? emptyDoc();

        if (JSON.stringify(incoming) !== JSON.stringify(editor.getJSON())) {
            editor.commands.setContent(incoming);
        }
    }, [value, editor]);

    return (
        <div className="rich-text-container w-full">
            <MenuBar editor={editor} />
            <EditorContent editor={editor} />
        </div>
    );
}
