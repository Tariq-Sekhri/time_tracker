import type {ExportOptions, InvoiceOptions} from "../types.ts";
import {DEFAULT_INVOICE, INVOICE_CURRENCIES} from "../formats/export/invoice.ts";

export default function InvoiceOptionsPanel({options, onChange}: {options: ExportOptions; onChange: (patch: Partial<ExportOptions>) => void}) {
    const invoice = {...DEFAULT_INVOICE, ...options.pdf.invoice};
    const setPdf = (patch: Partial<ExportOptions["pdf"]>) => onChange({pdf: {...options.pdf, ...patch}});
    const patch = (changes: Partial<InvoiceOptions>) => setPdf({invoice: {...invoice, ...changes}});
    return <div className="dt-section" style={{gap: 18}}>
        <div className="dt-subpanel">
            <span className="dt-subheading">Hourly invoice</span>
            <p className="settings-muted">Use Scope to narrow the report to a project or category. Leave the hourly rate blank to omit pricing from the PDF.</p>
            <div className="dt-field-grid">
                <label className="dt-field"><span>PDF layout</span><select className="dt-select" value="invoice" onChange={() => setPdf({layout: "report"})}><option value="report">Time report</option><option value="invoice">Hourly invoice</option></select></label>
                <label className="dt-field"><span>Invoice number</span><input className="dt-input" value={invoice.number} maxLength={60} placeholder="INV-001" onChange={event => patch({number: event.target.value})} /></label>
                <label className="dt-field"><span>Issue date</span><input className="dt-input" type="date" value={invoice.issuedOn} onChange={event => patch({issuedOn: event.target.value})} /></label>
                <label className="dt-field"><span>Due date</span><input className="dt-input" type="date" value={invoice.dueOn} onChange={event => patch({dueOn: event.target.value})} /></label>
                <label className="dt-field"><span>From</span><input className="dt-input" value={options.pdf.preparedBy} placeholder="Your name or business" onChange={event => setPdf({preparedBy: event.target.value})} /></label>
                <label className="dt-field"><span>Bill to</span><input className="dt-input" value={options.pdf.preparedFor} placeholder="Client name or business" onChange={event => setPdf({preparedFor: event.target.value})} /></label>
                <label className="dt-field"><span>Sender address / contact / tax ID</span><textarea className="dt-input" rows={3} value={invoice.senderDetails} onChange={event => patch({senderDetails: event.target.value})} /></label>
                <label className="dt-field"><span>Client address / contact</span><textarea className="dt-input" rows={3} value={invoice.clientDetails} onChange={event => patch({clientDetails: event.target.value})} /></label>
                <label className="dt-field"><span>Hourly rate (optional)</span><input aria-label="Hourly rate (optional)" aria-describedby="dt-invoice-rate-hint" className="dt-input" type="number" min={0} max={1000000} step="0.01" value={invoice.hourlyRate} placeholder="Leave blank for no pricing" onChange={event => patch({hourlyRate: event.target.value})} /><small id="dt-invoice-rate-hint">A single rate applies to all selected entries. Blank hides rate, amounts, tax, and monetary totals in the PDF.</small></label>
                <label className="dt-field"><span>Currency</span><select className="dt-select" value={invoice.currency} onChange={event => patch({currency: event.target.value as InvoiceOptions["currency"]})}>{INVOICE_CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select></label>
                <label className="dt-field"><span>Tax percentage (optional)</span><input className="dt-input" type="number" min={0} max={100} step="0.01" value={invoice.taxPercent} placeholder="Leave blank for no tax line" onChange={event => patch({taxPercent: event.target.value})} /></label>
            </div>
            <label className="dt-field"><span>Payment details / terms</span><textarea className="dt-input" rows={3} value={invoice.paymentTerms} placeholder="Payment instructions, reference, or agreed terms" onChange={event => patch({paymentTerms: event.target.value})} /></label>
        </div>
        <div className="dt-subpanel"><span className="dt-subheading">Presentation</span><div className="dt-field-grid">
            <label className="dt-field"><span>Page size</span><select className="dt-select" value={options.pdf.pageSize} onChange={event => setPdf({pageSize: event.target.value as "a4" | "letter"})}><option value="a4">A4</option><option value="letter">US Letter</option></select></label>
            <label className="dt-field"><span>Orientation</span><select className="dt-select" value={options.pdf.orientation} onChange={event => setPdf({orientation: event.target.value as "portrait" | "landscape"})}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
            <label className="dt-field"><span>Accent color</span><input className="dt-input" type="color" value={options.pdf.accentColor} onChange={event => setPdf({accentColor: event.target.value})} /></label>
            <label className="dt-field"><span>Date</span><select className="dt-select" value={options.dateFormat} onChange={event => onChange({dateFormat: event.target.value as ExportOptions["dateFormat"]})}><option value="iso">Year / month / day</option><option value="us">Month / day / year</option><option value="eu">Day / month / year</option></select></label>
            <label className="dt-field"><span>Round durations</span><select className="dt-select" value={options.rounding} onChange={event => onChange({rounding: Number(event.target.value) as ExportOptions["rounding"]})}>{[0, 1, 5, 6, 10, 15, 30, 60].map(minutes => <option key={minutes} value={minutes}>{minutes ? `${minutes} min` : "Exact"}</option>)}</select><small>Applied per entry before calculating charges. Start and end times stay exact.</small></label>
            {options.rounding !== 0 && <label className="dt-field"><span>Rounding direction</span><select className="dt-select" value={options.roundingMode} onChange={event => onChange({roundingMode: event.target.value as ExportOptions["roundingMode"]})}><option value="nearest">Nearest</option><option value="up">Always up</option><option value="down">Always down</option></select></label>}
        </div></div>
    </div>;
}
