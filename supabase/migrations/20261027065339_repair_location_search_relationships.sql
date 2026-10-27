-- Restore relationships used by public city suggestions and featured destinations.
-- Existing rows were checked for orphan references before adding these constraints.
ALTER TABLE public.cities ADD CONSTRAINT cities_state_region_id_fkey
  FOREIGN KEY (state_region_id) REFERENCES public.states_regions(id);
ALTER TABLE public.cities ADD CONSTRAINT cities_country_id_fkey
  FOREIGN KEY (country_id) REFERENCES public.countries(id);
ALTER TABLE public.states_regions ADD CONSTRAINT states_regions_country_id_fkey
  FOREIGN KEY (country_id) REFERENCES public.countries(id);
NOTIFY pgrst, 'reload schema';
