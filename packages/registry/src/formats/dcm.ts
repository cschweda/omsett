import type { Format } from '../types'

export const dcm: Format = {
  id: 'dcm',
  name: 'DICOM',
  category: 'image',
  extensions: ['dcm', 'dicom'],
  mime: ['application/dicom'],
  detect: ['dcm'],
  explain:
    'DICOM is the format of medical scans: an X-ray, an ultrasound, a slice of a CT or MRI. Beside the picture it carries the patient\u2019s name, date of birth and the details of the examination. Omsett converts the picture and leaves all of that behind. A file that holds a series converts as its first picture.',
  lossy: 'optional',
  traits: ['metadata', 'multi-page', 'full-color'],
  readOnly: 'DICOM can be read but not written',
}
