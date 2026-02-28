import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config(); 

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

//practice console log
/*
app.post('/webhook/suds', async (req, res) => {
  const contact = req.body;
  const triggered_tag = contact.customData?.triggered_tag;

  console.log('==================================================');
  console.log('Triggered tag from workflow:', contact.customData?.triggered_tag);
  console.log('Source-acc contact ID from workflow:', contact.contact_id);

  // rest of your code...
  res.sendStatus(200); // optional if just testing
});
*/

//this is the endpoint the webhook will call
app.post('/webhook/suds', async (req, res) => {
  const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
  const LOCATION_ID = process.env.LOCATION_ID;
  const CUSTOM_FIELD_ID = process.env.CUSTOM_FIELD_ID;
  const CUSTOM_FIELD_KEY = process.env.CUSTOM_FIELD_KEY;

  const contact = req.body;
  const triggered_tag = contact.customData?.triggered_tag;
  console.log('==================================================');
  //console.log('Received full body:', contact);
  console.log('Received contact:', contact.contact_id, contact.first_name, contact.last_name);

  const source_contact_id = contact.contact_id; //haba naman variable name ya

  try {
    //fetch all contacts from Suds Mgt (or apply allowed filters like email)
    const response = await axios.get(
      `https://services.leadconnectorhq.com/contacts`,
      {
        headers: {
          Accept: 'application/json',
          Version: '2021-07-28',
          Authorization: `Bearer ${ACCESS_TOKEN}`
        },
        params: {
          locationId: LOCATION_ID,
          limit: 100  // optional, you can page if more than 100
        }
      }
    );

    //filter in code by custom field sync_contact_id
    const existingContact = response.data.contacts.find(c =>
      c.customFields?.some(f => f.id === CUSTOM_FIELD_ID && f.value === source_contact_id)
    );
        
    //console.log('Existing Suds Mgt contact:', existingContact);

    //Next: decide update or create based on existingContact
    if (existingContact) {
      console.log('----------');
      console.log('Contact already exists in Suds Mgt. Ready to UPDATE.');

      const updateData = {
        firstName: contact.first_name,
        lastName: contact.last_name,
        name: contact.full_name || `${contact.first_name} ${contact.last_name}`,
        ...(contact.email ? { email: contact.email } : {}),
        ...(contact.phone ? { phone: contact.phone } : {}),
        tags: triggered_tag ? [triggered_tag] : [],
        customFields: [
          {
            id: CUSTOM_FIELD_ID, 
            key: CUSTOM_FIELD_KEY, 
            field_value: source_contact_id
          }
        ]
      };

      console.log('Payload to Suds Mgt (update):', JSON.stringify(updateData, null, 2));

      try {
        const updateResponse = await axios.put(
          `https://services.leadconnectorhq.com/contacts/${existingContact.id}`,
          updateData,
          {
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Version: '2021-07-28',
              Authorization: `Bearer ${ACCESS_TOKEN}`
            }
          }
        );

        console.log('Updated Suds Mgt contact:', updateResponse.data);
      } catch (error) {
        const errData = error.response?.data;
        const isDuplicateEmail =
          error.response?.status === 400 &&
          errData?.message?.includes('does not allow duplicated contacts') &&
          errData?.meta?.matchingField === 'email';

        if (isDuplicateEmail) {
          console.log(
            'Duplicate email found during update. Skipping. Existing contact ID:',
            errData.meta.contactId
          );
        } else {
          console.error('Error updating contact in Suds Mgt:', errData || error.message);
        }
      }
    } else {
      console.log('----------');
      console.log('Contact does NOT exist in Suds Mgt. Ready to CREATE.');

      const createData = {
        firstName: contact.first_name,
        lastName: contact.last_name,
        name: contact.full_name || `${contact.first_name} ${contact.last_name}`,
        ...(contact.email ? { email: contact.email } : {}),
        ...(contact.phone ? { phone: contact.phone } : {}),
        tags: triggered_tag ? [triggered_tag] : [],
        customFields: [
          {
            id: CUSTOM_FIELD_ID, 
            key: CUSTOM_FIELD_KEY,
            field_value: source_contact_id
          }
        ],
        locationId: LOCATION_ID
      };

      //console.log('Payload to Suds Mgt (create):', JSON.stringify(createData, null, 2));

      const createResponse = await axios.post(
        'https://services.leadconnectorhq.com/contacts',
        createData,
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Version: '2021-07-28',
            Authorization: `Bearer ${ACCESS_TOKEN}`
          }
        }
      );

      console.log('Created new SudsMgt contact:', createResponse.data);

      //check if sync_contact_id is present
      const createdCustomFields = createResponse.data.contact.customFields || [];
      const syncIdField = createdCustomFields.find(f => f.id === CUSTOM_FIELD_ID);
      if (syncIdField) {
        console.log('✅ sync_contact_id saved:', syncIdField.value);
      } else {
        console.warn('⚠️ sync_contact_id not saved in customFields!');
      }
    }
    res.sendStatus(200);
  } catch (error) {
    const errData = error.response?.data;

    const isDuplicateEmail =
      error.response?.status === 400 &&
      errData?.message?.includes('does not allow duplicated contacts') &&
      errData?.meta?.matchingField === 'email';
      //only skip when it is specifically the duplicate email error
      //not all 400 errors should be ignored

    if (isDuplicateEmail) {
      console.log('Duplicate email found. Skipping creation. Existing contact ID:', errData.meta.contactId);
      return res.json({ status: 'skipped', reason: 'duplicate email' });
    } else {
      console.error('Error creating contact in SudsMgt x:', errData || error.message);
      return res.json({ status: 'Error syncing' });
    }
  }
});

app.get("/", (req, res) => res.send("Backend is running wewewe"));

app.listen(port, () => {
  console.log(`✅ Backend running at http://localhost:${port} (ykrjm2026)`);
});