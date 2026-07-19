import { useTranslation } from 'react-i18next';

import { Card, CardBody } from '@components/ui/Card';
import { PageHeader } from '@components/ui/PageHeader';

/**
 * Legal notice required by section 5 DDG.
 *
 * The details below are placeholders and MUST be completed by the operator
 * before the site is made publicly available. An incomplete legal notice is
 * actionable under German law.
 */
export function ImprintPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t('pages.imprint.title')} />
      <Card className="max-w-2xl">
        <CardBody className="prose-sm flex flex-col gap-4 text-sm text-fg-secondary">
          <p className="rounded-[var(--radius-control)] border border-warning/40 bg-warning/10 p-3 text-warning">
            <strong>TODO(Betreiber):</strong> Dieser Text ist ein Platzhalter. Vor der
            Veröffentlichung sind die Pflichtangaben nach § 5 DDG zu ergänzen.
          </p>

          <section>
            <h2 className="mb-1 text-sm font-semibold text-fg">Angaben gemäß § 5 DDG</h2>
            <p>
              TODO: Name / Firma
              <br />
              TODO: Straße und Hausnummer
              <br />
              TODO: PLZ und Ort
              <br />
              TODO: Land
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold text-fg">Kontakt</h2>
            <p>
              TODO: E-Mail-Adresse
              <br />
              TODO: ggf. Telefonnummer
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              Diese Adresse dient zugleich als Kontakt für Hinweise auf mögliche
              Urheberrechtsverletzungen (Notice-and-Takedown).
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold text-fg">Nutzungshinweis zu Inhalten</h2>
            <p>
              TournaCore speichert alle Inhalte ausschließlich lokal im Browser des Nutzers. Für
              hochgeladene Logos, Banner und sonstige Inhalte ist allein der Nutzer verantwortlich.
              Mit dem Hochladen sichert er zu, über die erforderlichen Rechte an dem Material zu
              verfügen.
            </p>
          </section>
        </CardBody>
      </Card>
    </>
  );
}
