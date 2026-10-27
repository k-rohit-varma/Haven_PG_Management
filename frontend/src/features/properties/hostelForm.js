import { z } from 'zod';

export const hostelFormSchema = z.object({
  name: z.string().trim().min(2, 'Enter a property name.').max(120),
  address: z.string().trim().min(5, 'Enter the street address.').max(300),
  city: z.string().trim().min(2, 'Enter a city.').max(100),
  accommodationPolicy: z.enum(['MIXED', 'MALE_ONLY', 'FEMALE_ONLY'], { message: 'Choose an accommodation policy.' }),
  contactPhone: z.string().trim().max(30, 'Contact phone must be 30 characters or fewer.'),
  description: z.string().trim().max(2000, 'Description must be 2000 characters or fewer.'),
  facilities: z.string().max(1000, 'Facilities must be 1000 characters or fewer.'),
  ownerId: z.string().trim().min(1, 'Select an active owner.'),
});

export function createHostelFormDefaults() {
  return { name: '', address: '', city: '', accommodationPolicy: 'MIXED', contactPhone: '', description: '', facilities: '', ownerId: '' };
}

export function toCreateHostelPayload(values) {
  return {
    name: values.name,
    address: values.address,
    city: values.city,
    accommodationPolicy: values.accommodationPolicy,
    contactPhone: values.contactPhone,
    description: values.description,
    facilities: values.facilities.split(',').map((item) => item.trim()).filter(Boolean),
    images: [],
    ...(values.ownerId ? { ownerId: values.ownerId } : {}),
  };
}
