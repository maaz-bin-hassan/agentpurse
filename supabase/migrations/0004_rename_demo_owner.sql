-- Moves the demo household to its new owner. The linked wallet and history stay.
INSERT INTO owners (id, name, email, panic_frozen, created_at)
SELECT 'purse_maaz', 'Maaz Hassan', 'maaz@example.com', panic_frozen, created_at FROM owners WHERE id = 'purse_maya';

UPDATE vaults SET owner_id = 'purse_maaz', id = 'vault_maaz' WHERE owner_id = 'purse_maya';
UPDATE agents SET owner_id = 'purse_maaz' WHERE owner_id = 'purse_maya';
UPDATE intents SET owner_id = 'purse_maaz' WHERE owner_id = 'purse_maya';
UPDATE receipts SET owner_id = 'purse_maaz' WHERE owner_id = 'purse_maya';
UPDATE paypal_orders SET owner_id = 'purse_maaz' WHERE owner_id = 'purse_maya';
UPDATE mock_setup_tokens SET owner_id = 'purse_maaz' WHERE owner_id = 'purse_maya';
UPDATE audit_events SET owner_id = 'purse_maaz' WHERE owner_id = 'purse_maya';
UPDATE webauthn_credentials SET owner_id = 'purse_maaz' WHERE owner_id = 'purse_maya';
UPDATE webauthn_challenges SET owner_id = 'purse_maaz' WHERE owner_id = 'purse_maya';
UPDATE push_subscriptions SET owner_id = 'purse_maaz' WHERE owner_id = 'purse_maya';
UPDATE notifications SET owner_id = 'purse_maaz' WHERE owner_id = 'purse_maya';
UPDATE oauth_codes SET owner_id = 'purse_maaz' WHERE owner_id = 'purse_maya';
UPDATE oauth_tokens SET owner_id = 'purse_maaz' WHERE owner_id = 'purse_maya';

UPDATE mock_payment_tokens SET id = 'VAULT-MOCK-MAAZ', payer_email = 'maaz@example.com' WHERE id = 'VAULT-MOCK-MAYA';
UPDATE vaults SET payment_token_id = 'VAULT-MOCK-MAAZ', payer_email = 'maaz@example.com' WHERE payment_token_id = 'VAULT-MOCK-MAYA';

DELETE FROM owners WHERE id = 'purse_maya';
