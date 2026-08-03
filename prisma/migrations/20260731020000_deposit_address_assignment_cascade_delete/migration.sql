-- Deleting a DepositTreasuryAddress now revokes its assignment (if any)
-- along with it, instead of being blocked outright — an admin deleting
-- an assigned address is deliberately reclaiming it; the affected
-- wallet just gets a fresh one assigned on its next request.
ALTER TABLE "DepositAddressAssignment" DROP CONSTRAINT "DepositAddressAssignment_addressId_fkey";
ALTER TABLE "DepositAddressAssignment" ADD CONSTRAINT "DepositAddressAssignment_addressId_fkey"
  FOREIGN KEY ("addressId") REFERENCES "DepositTreasuryAddress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
