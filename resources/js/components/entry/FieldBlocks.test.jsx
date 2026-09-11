// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StaticFields from './StaticFields';
import TranslatableFields from './TranslatableFields';
import PublicationPanel from './PublicationPanel';
import FieldErrors from './FieldErrors';

vi.mock('../../lib/api', () => ({ default: {}, uploadImage: vi.fn() }));
vi.mock('../RichTextEditor', () => ({ default: () => <div data-testid="rich-text" /> }));

const LANGUAGES = [
    { id: 1, code: 'el', is_default: true },
    { id: 2, code: 'en' },
];

describe('StaticFields', () => {
    const draw = (fields, props = {}) => render(
        <StaticFields
            fields={fields}
            values={{}}
            onChange={vi.fn()}
            languages={LANGUAGES}
            errors={{}}
            onError={vi.fn()}
            {...props}
        />
    );

    it('renders nothing when the module has no static fields', () => {
        const { container } = draw([]);

        expect(container).toBeEmptyDOMElement();
    });

    // A `for` pointing at an id nothing renders is worse than no `for`: the
    // control still has no accessible name and clicking does nothing, while the
    // markup claims otherwise.
    it('labels a plain field so the label actually reaches it', () => {
        draw([{ name: 'sleeps', type: 'integer' }]);

        expect(screen.getByLabelText('sleeps')).toHaveAttribute('type', 'number');
    });

    it.each([
        ['rich text', { name: 'description', type: 'text' }],
        ['a gallery', { name: 'photos', type: 'gallery' }],
    ])('names %s as a group, since no `for` can address it', (_label, field) => {
        draw([field]);

        // Named, and named by the same words - just through the mechanism a
        // composite control is supposed to use.
        expect(screen.getByRole('group', { name: field.name })).toBeInTheDocument();
    });

    // Two labels on one control are announced differently by every reader:
    // some join them, some take the first.
    it('gives a boolean exactly one label', () => {
        draw([{ name: 'featured', type: 'boolean' }]);

        expect(screen.getByLabelText('featured')).toHaveAttribute('type', 'checkbox');
        expect(screen.queryAllByText('Enable this field')).toHaveLength(1);
        expect(document.querySelectorAll('label[for="field-featured"]')).toHaveLength(1);
    });

    it('shows a field’s own validation messages', () => {
        draw([{ name: 'sleeps', type: 'integer' }], { errors: { 'data.sleeps': ['Too many.'] } });

        expect(screen.getByText('Too many.')).toBeInTheDocument();
    });
});

describe('TranslatableFields', () => {
    const draw = (props = {}) => render(
        <TranslatableFields
            fields={[{ name: 'title', type: 'string', translatable: true }]}
            languages={LANGUAGES}
            activeLangId={1}
            onLanguageChange={vi.fn()}
            translations={{ 1: { title: 'Σουίτα' }, 2: { title: 'Suite' } }}
            onChange={vi.fn()}
            errors={{}}
            onError={vi.fn()}
            {...props}
        />
    );

    it('edits one language at a time', () => {
        draw();

        expect(screen.getByLabelText(/title/)).toHaveValue('Σουίτα');
    });

    it('switches language when a tab is pressed', async () => {
        const user = userEvent.setup();
        const onLanguageChange = vi.fn();
        draw({ onLanguageChange });

        await user.click(screen.getByRole('button', { name: /EN/ }));

        expect(onLanguageChange).toHaveBeenCalledWith(2);
    });

    // The dot on a tab is a colour and a shape; this is what says the same
    // thing to a reader who has neither.
    it('marks a language that failed, in words as well as in paint', () => {
        draw({ errors: { 'data.title.en': ['Required.'] } });

        expect(screen.getByRole('button', { name: /EN.*has errors/s })).toBeInTheDocument();
    });

    /**
     * The regression this guard exists for.
     *
     * `FieldErrors` reads a null `langCode` as "this field is not translatable,
     * show everything" - so rendering with a language that resolves to nothing
     * put *every* language's complaints under *every* box, which is the defect
     * #96 fixed: the Greek box marked wrong because the French one was empty.
     */
    it('refuses to render rather than show every language’s errors at once', () => {
        draw({
            activeLangId: 999,
            errors: { 'data.title.el': ['Greek is wrong.'], 'data.title.en': ['English is wrong.'] },
        });

        expect(screen.queryByText('Greek is wrong.')).not.toBeInTheDocument();
        expect(screen.queryByText('English is wrong.')).not.toBeInTheDocument();
    });

    it('shows only the open language’s messages', () => {
        draw({
            activeLangId: 1,
            errors: { 'data.title.el': ['Greek is wrong.'], 'data.title.en': ['English is wrong.'] },
        });

        expect(screen.getByText('Greek is wrong.')).toBeInTheDocument();
        expect(screen.queryByText('English is wrong.')).not.toBeInTheDocument();
    });
});

describe('PublicationPanel', () => {
    const draw = (props = {}) => render(
        <PublicationPanel
            status="draft"
            onStatusChange={vi.fn()}
            publishedAt={null}
            languages={LANGUAGES}
            slugs={{}}
            onSlugChange={vi.fn()}
            {...props}
        />
    );

    it('reports which status is chosen', () => {
        draw({ status: 'published' });

        expect(screen.getByRole('button', { name: 'Published' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Draft' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('offers one address box per language, each labelled', () => {
        draw({ slugs: { el: 'souita' } });

        expect(screen.getByLabelText('el')).toHaveValue('souita');
        expect(screen.getByLabelText('en')).toHaveValue('');
    });

    it('reports an edited address by its language', async () => {
        const user = userEvent.setup();
        const onSlugChange = vi.fn();
        draw({ onSlugChange });

        await user.type(screen.getByLabelText('en'), 'a');

        expect(onSlugChange).toHaveBeenCalledWith('en', 'a');
    });

    // `published_at` records when an entry *first* went out and never moves
    // (ARCHITECTURE §2), so it is shown rather than offered as a control.
    it('shows when an entry first went out, and only once it has', () => {
        const { rerender } = render(
            <PublicationPanel status="draft" onStatusChange={vi.fn()} publishedAt={null}
                languages={LANGUAGES} slugs={{}} onSlugChange={vi.fn()} />
        );

        expect(screen.queryByText(/First published/)).not.toBeInTheDocument();

        rerender(
            <PublicationPanel status="published" onStatusChange={vi.fn()} publishedAt="2026-09-01T00:00:00Z"
                languages={LANGUAGES} slugs={{}} onSlugChange={vi.fn()} />
        );

        expect(screen.getByText(/First published/)).toBeInTheDocument();
    });

    // A site with no languages has no addresses to give, and an empty
    // "Address" heading over nothing reads like something failed to load.
    it('hides the address section when the site has no languages', () => {
        draw({ languages: [] });

        expect(screen.queryByText('Address')).not.toBeInTheDocument();
        expect(screen.getByText('Publication')).toBeInTheDocument();
    });
});

describe('FieldErrors', () => {
    it('says nothing when a field is clean', () => {
        const { container } = render(<FieldErrors errors={{}} fieldName="title" />);

        expect(container).toBeEmptyDOMElement();
    });

    // A gallery's keys nest deeper than one segment - `data.photos.0.url` - so
    // filtering by language would hide them entirely.
    it('shows every message for a field that is not translatable', () => {
        render(
            <FieldErrors
                errors={{ 'data.photos.0.url': ['Not an image.'] }}
                fieldName="photos"
            />
        );

        expect(screen.getByText('Not an image.')).toBeInTheDocument();
    });
});
