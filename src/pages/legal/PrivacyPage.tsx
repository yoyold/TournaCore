import { useTranslation } from 'react-i18next';

import { Card, CardBody } from '@components/ui/Card';
import { PageHeader } from '@components/ui/PageHeader';

/**
 * Privacy policy.
 *
 * The substantive claim is not a formality: no personal data is processed on a
 * server because there is no server. That property is enforced technically by
 * the CSP (`connect-src 'self'` in vite.config.ts) and by an end-to-end test
 * that fails as soon as a request targets a foreign origin.
 *
 * The controller details are placeholders and must be filled in before the site
 * is made publicly available.
 */
export function PrivacyPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t('pages.privacy.title')} />
      <Card className="max-w-2xl">
        <CardBody className="flex flex-col gap-5 text-sm text-fg-secondary">
          <p className="rounded-[var(--radius-control)] border border-warning/40 bg-warning/10 p-3 text-warning">
            <strong>TODO(Betreiber):</strong> Angaben zum Verantwortlichen ergänzen und den Text vor
            der Veröffentlichung rechtlich prüfen lassen.
          </p>

          <section>
            <h2 className="mb-1 text-sm font-semibold text-fg">1. Verantwortlicher</h2>
            <p>TODO: Name, Anschrift und E-Mail-Adresse des Verantwortlichen.</p>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold text-fg">2. Grundsatz: keine Serverdaten</h2>
            <p>
              TournaCore ist eine reine Browser-Anwendung. Sämtliche von dir angelegten Daten —
              Turniere, Teams, Matches, Bilder — werden ausschließlich lokal in deinem Browser
              gespeichert (IndexedDB und LocalStorage). Sie werden zu keinem Zeitpunkt an einen
              Server übertragen. Es findet kein Tracking statt, es werden keine Cookies zu Analyse-
              oder Marketingzwecken gesetzt und keine externen Dienste eingebunden.
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold text-fg">3. Hosting und Server-Logdateien</h2>
            <p>
              Diese Seite wird über GitHub Pages (GitHub Inc., USA) ausgeliefert. Beim Abruf
              verarbeitet GitHub technisch notwendige Zugriffsdaten, darunter deine IP-Adresse.
              Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer
              sicheren und zuverlässigen Bereitstellung). Die Übermittlung in die USA erfolgt auf
              Grundlage des EU-US Data Privacy Framework. Näheres in der Datenschutzerklärung von
              GitHub.
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold text-fg">4. Lokale Speicherung</h2>
            <p>
              Der Zugriff auf den lokalen Speicher deines Geräts ist für den Betrieb der Anwendung
              unbedingt erforderlich — ohne ihn hätte TournaCore keine Funktion. Er ist daher nach §
              25 Abs. 2 TDDDG einwilligungsfrei. Ein Cookie-Banner ist aus diesem Grund weder nötig
              noch vorhanden. Die Daten verbleiben, bis du sie selbst löschst oder die Browserdaten
              für diese Seite entfernst.
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold text-fg">5. Daten Dritter</h2>
            <p>
              Wenn du Namen realer Personen erfasst — etwa Spielernamen —, verarbeitest du
              personenbezogene Daten Dritter und bist dafür selbst verantwortlich. Wir empfehlen,
              auf Klarnamen zu verzichten und nur Nicknames zu verwenden. Beim Export oder Teilen
              von Daten verlassen diese Informationen dein Gerät.
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold text-fg">6. Deine Rechte</h2>
            <p>
              Dir stehen die Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung,
              Datenübertragbarkeit und Widerspruch nach Art. 15 bis 21 DSGVO zu sowie ein
              Beschwerderecht bei einer Aufsichtsbehörde. Da alle Daten lokal liegen, kannst du
              diese Rechte unmittelbar selbst ausüben: Der Export unter „Import / Export&#8220;
              erfüllt die Datenübertragbarkeit, das Löschen der Anwendungsdaten in den Einstellungen
              die Löschung.
            </p>
          </section>
        </CardBody>
      </Card>
    </>
  );
}
