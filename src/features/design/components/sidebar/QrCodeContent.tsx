import XIcon from '@duyank/icons/regular/X';
import type {
  LayerId,
  LayerType,
  SerializedLayerTree,
  SerializedLayers,
} from '@lidojs/design-core';
import { useEditor } from '@lidojs/design-editor';
import { type FC, type ReactNode, useState } from 'react';
import { isMobile } from 'react-device-detect';
import { qrCodeList } from '../../config/qrCode';
import {
  QR_PAYLOAD_KINDS,
  WIFI_SECURITIES,
  type QrPayloadFields,
  type QrPayloadKind,
  type QrWifiSecurity,
  buildQrPayload,
  describeQrPayload,
  isQrPayloadReady,
} from '../../../../utils/qrPayload';
import { QrPresetThumb, cogIcon } from './QrPresetThumb';

const labelCss = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--app-text-muted)',
} as const;

const inputCss = {
  width: '100%',
  minWidth: 0,
  border: '1px solid var(--app-border-strong)',
  background: 'var(--app-surface)',
  color: 'var(--app-text-strong)',
  borderRadius: 8,
  padding: '7px 9px',
  fontSize: 13,
  outline: 'none',
  ':focus': { borderColor: '#3d8eff' },
} as const;

const Field: FC<{ label: string; children: ReactNode }> = ({
  label,
  children,
}) => (
  <label css={labelCss}>
    {label}
    {children}
  </label>
);

export const QrCodeContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const { actions } = useEditor();
  const [kind, setKind] = useState<QrPayloadKind>('url');
  const [fields, setFields] = useState<QrPayloadFields>({ security: 'WPA' });

  const set = <K extends keyof QrPayloadFields>(
    key: K,
    value: QrPayloadFields[K],
  ) => setFields((current) => ({ ...current, [key]: value }));

  const payload = buildQrPayload(kind, fields);
  const ready = isQrPayloadReady(kind, fields);
  /**
   * Insert a QR preset.
   *
   * The shipped presets bake their own logo into the layer, so it is replaced
   * here with a neutral cog as a demo icon — a new QR should not carry the
   * shipped branding, but showing an icon makes the feature discoverable. The
   * QR toolbar can swap it for the user's own image or clear it. Passing
   * `payload` overrides the preset's destination.
   */
  const addQrCode = (elements: SerializedLayerTree, override?: string) => {
    const tree = JSON.parse(JSON.stringify(elements)) as SerializedLayerTree;
    for (const id of Object.keys(tree.layers)) {
      const layer = tree.layers[id] as {
        type: { resolvedName: string };
        props: Record<string, unknown>;
      };
      if (layer?.type?.resolvedName === 'QrCodeLayer') {
        const { logo: _shipped, textColor, ...rest } = layer.props;
        const dark = String(textColor ?? '#1e1e2d');
        layer.props = {
          ...rest,
          /**
           * `textColor` is destructured out to choose the icon's colour, so it
           * has to be put back: leaving it out dropped the layer's own dark
           * colour, and the renderer's fallback happens to be the same value,
           * so the loss was invisible until you looked at what was saved.
           */
          textColor: dark,
          logo: cogIcon(dark),
          ...(override === undefined ? {} : { text: override }),
        };
      }
    }
    actions.addLayerTree(tree);
    if (isMobile) {
      onClose();
    }
  };

  /**
   * What the form is about to encode, or `undefined` when it is incomplete.
   *
   * Once the form has something in it, the style tiles insert *that* rather
   * than their own placeholder — picking a style after typing a link should
   * style the link, not throw it away.
   */
  const pending = ready ? payload : undefined;
  const handleDrag = (
    event: React.DragEvent,
    elements: SerializedLayerTree,
  ) => {
    const data: {
      layer: LayerType;
      data: { rootId: LayerId; layers: SerializedLayers };
    } = {
      layer: 'Image',
      data: elements,
    };
    const { clientX, clientY } = event;
    actions.startDragNDrop(data, { x: clientX, y: clientY });
    event.dataTransfer.clearData('text/plain');
    event.dataTransfer.setData('text/plain', JSON.stringify(data));
    event.dataTransfer.setDragImage(new Image(), 0, 0);
  };

  /** The inputs for the selected content type. */
  const renderFields = () => {
    switch (kind) {
      case 'url':
        return (
          <Field label="Link">
            <input
              css={inputCss}
              value={fields.url ?? ''}
              aria-label="QR link"
              placeholder="https://example.com"
              onChange={(event) => set('url', event.target.value)}
            />
          </Field>
        );
      case 'text':
        return (
          <Field label="Text">
            <textarea
              css={{ ...inputCss, minHeight: 60, resize: 'vertical' }}
              value={fields.text ?? ''}
              aria-label="QR text"
              placeholder="Anything you like"
              onChange={(event) => set('text', event.target.value)}
            />
          </Field>
        );
      case 'wifi':
        return (
          <>
            <Field label="Network name">
              <input
                css={inputCss}
                value={fields.ssid ?? ''}
                aria-label="WiFi network name"
                placeholder="Guest WiFi"
                onChange={(event) => set('ssid', event.target.value)}
              />
            </Field>
            <Field label="Security">
              <select
                css={inputCss}
                value={fields.security ?? 'WPA'}
                aria-label="WiFi security"
                onChange={(event) =>
                  set('security', event.target.value as QrWifiSecurity)
                }
              >
                {WIFI_SECURITIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            {fields.security === 'nopass' ? null : (
              <Field label="Password">
                <input
                  css={inputCss}
                  value={fields.password ?? ''}
                  aria-label="WiFi password"
                  placeholder="Leave blank if there isn't one"
                  onChange={(event) => set('password', event.target.value)}
                />
              </Field>
            )}
            <label
              css={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: 'var(--app-text)',
              }}
            >
              <input
                type="checkbox"
                aria-label="Hidden network"
                checked={fields.hidden ?? false}
                onChange={(event) => set('hidden', event.target.checked)}
              />
              The network is hidden
            </label>
          </>
        );
      case 'vcard':
        return (
          <>
            <div css={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="First name">
                <input
                  css={inputCss}
                  value={fields.firstName ?? ''}
                  aria-label="Contact first name"
                  onChange={(event) => set('firstName', event.target.value)}
                />
              </Field>
              <Field label="Last name">
                <input
                  css={inputCss}
                  value={fields.lastName ?? ''}
                  aria-label="Contact last name"
                  onChange={(event) => set('lastName', event.target.value)}
                />
              </Field>
            </div>
            <Field label="Organisation">
              <input
                css={inputCss}
                value={fields.organization ?? ''}
                aria-label="Contact organisation"
                onChange={(event) => set('organization', event.target.value)}
              />
            </Field>
            <Field label="Job title">
              <input
                css={inputCss}
                value={fields.jobTitle ?? ''}
                aria-label="Contact job title"
                onChange={(event) => set('jobTitle', event.target.value)}
              />
            </Field>
            <Field label="Phone">
              <input
                css={inputCss}
                value={fields.vcardPhone ?? ''}
                aria-label="Contact phone"
                onChange={(event) => set('vcardPhone', event.target.value)}
              />
            </Field>
            <Field label="Email">
              <input
                css={inputCss}
                value={fields.vcardEmail ?? ''}
                aria-label="Contact email"
                onChange={(event) => set('vcardEmail', event.target.value)}
              />
            </Field>
            <Field label="Website">
              <input
                css={inputCss}
                value={fields.vcardWebsite ?? ''}
                aria-label="Contact website"
                placeholder="https://example.com"
                onChange={(event) => set('vcardWebsite', event.target.value)}
              />
            </Field>
          </>
        );
      case 'sms':
        return (
          <>
            <Field label="Phone">
              <input
                css={inputCss}
                value={fields.phone ?? ''}
                aria-label="SMS phone"
                placeholder="+44 7700 900123"
                onChange={(event) => set('phone', event.target.value)}
              />
            </Field>
            <Field label="Message">
              <textarea
                css={{ ...inputCss, minHeight: 60, resize: 'vertical' }}
                value={fields.message ?? ''}
                aria-label="SMS message"
                placeholder="Pre-filled, but the sender can still edit it"
                onChange={(event) => set('message', event.target.value)}
              />
            </Field>
          </>
        );
      case 'email':
        return (
          <>
            <Field label="To">
              <input
                css={inputCss}
                value={fields.emailTo ?? ''}
                aria-label="Email recipient"
                placeholder="hello@example.com"
                onChange={(event) => set('emailTo', event.target.value)}
              />
            </Field>
            <Field label="Subject">
              <input
                css={inputCss}
                value={fields.subject ?? ''}
                aria-label="Email subject"
                onChange={(event) => set('subject', event.target.value)}
              />
            </Field>
            <Field label="Message">
              <textarea
                css={{ ...inputCss, minHeight: 60, resize: 'vertical' }}
                value={fields.body ?? ''}
                aria-label="Email body"
                onChange={(event) => set('body', event.target.value)}
              />
            </Field>
          </>
        );
      case 'tel':
        return (
          <Field label="Phone">
            <input
              css={inputCss}
              value={fields.phone ?? ''}
              aria-label="Phone number"
              placeholder="+44 7700 900123"
              onChange={(event) => set('phone', event.target.value)}
            />
          </Field>
        );
      default:
        return null;
    }
  };

  return (
    <div
      css={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        overflowY: 'auto',
        display: 'flex',
      }}
    >
      <div
        css={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          height: 48,
          borderBottom: '1px solid var(--app-border)',
          padding: '0 20px',
        }}
      >
        <p
          css={{
            lineHeight: '48px',
            fontWeight: 600,
            color: 'var(--app-text-strong)',
            flexGrow: 1,
          }}
        >
          QR Code
        </p>
        <div
          css={{
            fontSize: 20,
            flexShrink: 0,
            width: 32,
            height: 32,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={onClose}
        >
          <XIcon />
        </div>
      </div>
      <div
        css={{ flexDirection: 'column', overflowY: 'auto', display: 'flex' }}
      >
        {/* What the code should carry, rather than only a destination URL. */}
        <div
          css={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '14px 16px 0',
            flexShrink: 0,
          }}
        >
          <Field label="Opens">
            <select
              css={inputCss}
              value={kind}
              aria-label="QR content type"
              onChange={(event) => setKind(event.target.value as QrPayloadKind)}
            >
              {QR_PAYLOAD_KINDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          {renderFields()}
          {ready ? (
            <div
              css={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: 11,
                color: 'var(--app-text-muted)',
              }}
            >
              <span>{describeQrPayload(kind, fields)}</span>
              {/*
                Show the string that will actually be encoded. The WiFi and
                contact forms are the ones worth seeing: a stray delimiter in a
                password is invisible in the form and obvious here.
              */}
              <code
                css={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: 48,
                  overflow: 'hidden',
                  background: 'var(--app-surface)',
                  border: '1px solid var(--app-border)',
                  borderRadius: 6,
                  padding: '5px 7px',
                  color: 'var(--app-text)',
                }}
              >
                {payload}
              </code>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => addQrCode(qrCodeList[0].elements[0], pending)}
            disabled={!ready}
            css={{
              border: 'none',
              background: '#3d8eff',
              color: '#fff',
              borderRadius: 8,
              padding: '9px 14px',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
            }}
          >
            Add QR code
          </button>
        </div>
        <p
          css={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--app-text-muted)',
            padding: '16px 16px 0',
            margin: 0,
          }}
        >
          Or start from a style
        </p>
        <div
          css={{
            flexGrow: 1,
            display: 'grid',
            gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
            gridGap: 8,
            padding: 16,
          }}
        >
          {qrCodeList.map((item, index) => (
            <div
              key={index}
              css={{
                cursor: 'pointer',
                position: 'relative',
                '-webkit-user-drag': 'element',
              }}
              onClick={() => addQrCode(item.elements[0], pending)}
              onDragStart={(e) => handleDrag(e, item.elements[0])}
            >
              <div css={{ paddingBottom: '100%' }} />
              <div
                css={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: '100%',
                }}
              >
                <QrPresetThumb item={item} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
