import assert from "node:assert/strict";
import { readVendorListResponse, readVendorRet } from "./qbxml.ts";

const xml = `
<VendorQueryRs statusCode="0" iteratorRemainingCount="0">
  <VendorRet>
    <ListID>8000002A-111</ListID>
    <Name>ABC Supply &amp; Co</Name>
    <IsActive>true</IsActive>
    <CompanyName>ABC Supply</CompanyName>
    <FirstName>Pat</FirstName>
    <LastName>Nguyen</LastName>
    <VendorAddress>
      <Addr1>914 S Main St</Addr1>
      <Addr2>Ste 4</Addr2>
      <City>Dallas</City>
      <State>TX</State>
      <PostalCode>75201</PostalCode>
    </VendorAddress>
    <Phone>(214) 555-0100</Phone>
    <AltPhone>(214) 555-0199</AltPhone>
    <Fax>(214) 555-0111</Fax>
    <Email>ap@abcsupply.com</Email>
    <Contact>AP Desk</Contact>
    <AccountNumber>ABC-441</AccountNumber>
    <VendorTypeRef>
      <FullName>Materials</FullName>
    </VendorTypeRef>
    <TermsRef>
      <FullName>Net 30</FullName>
    </TermsRef>
    <VendorTaxIdent>12-3456789</VendorTaxIdent>
    <CreditLimit>25000.00</CreditLimit>
    <Balance>180.50</Balance>
    <Notes>Will-call only</Notes>
  </VendorRet>
  <VendorRet>
    <ListID>8000002B-222</ListID>
    <Name>Old Dumpster Co</Name>
    <IsActive>false</IsActive>
    <Phone>9725550165</Phone>
  </VendorRet>
</VendorQueryRs>
`;

const parsed = readVendorListResponse(xml);
assert.equal(parsed.vendors.length, 2);
assert.equal(parsed.done, true);

const abc = parsed.vendors[0];
assert.ok(abc);
assert.equal(abc.name, "ABC Supply & Co");
assert.equal(abc.isActive, true);
assert.equal(abc.companyName, "ABC Supply");
assert.equal(abc.street, "914 S Main St");
assert.equal(abc.city, "Dallas");
assert.equal(abc.state, "TX");
assert.equal(abc.phone, "(214) 555-0100");
assert.equal(abc.email, "ap@abcsupply.com");
assert.equal(abc.vendorType, "Materials");
assert.equal(abc.terms, "Net 30");
assert.equal(abc.taxId, "12-3456789");
assert.equal(abc.notes, "Will-call only");

const inactive = parsed.vendors[1];
assert.ok(inactive);
assert.equal(inactive.isActive, false);
assert.equal(inactive.name, "Old Dumpster Co");

assert.equal(readVendorRet("<VendorRet><IsActive>true</IsActive></VendorRet>"), null);

console.log("qbxml-vendors.test.ts ok");
