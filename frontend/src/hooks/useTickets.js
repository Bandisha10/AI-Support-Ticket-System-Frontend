import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ticketService from "../services/ticketService";

// Cached ticket-list hook with background revalidation.
// mode: "mine" (customer) or "queue" (agent)

export function useTickets(mode = "mine", params = {}) {
  const queryKey = ["tickets", mode, params];

  const query = useQuery({
    queryKey,
    queryFn: () =>
      mode === "queue"
        ? ticketService.getQueue(params)
        : ticketService.getMyTickets(params),
    placeholderData: (previousData) => previousData, // Keeps previous list visible during filter/page switches
  });

  return {
    tickets: query.data || [],
    loading: query.isLoading, // Only true on first cold fetch when no cache exists
    isFetching: query.isFetching, // True during background refreshes
    error: query.error?.response?.data?.detail || query.error?.message || null,
    refetch: query.refetch,
  };
}

export function useTicketDetail(ticketId) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => ticketService.getTicketById(ticketId),
    enabled: Boolean(ticketId),
  });

  return {
    ticket: query.data || null,
    loading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.response?.data?.detail || query.error?.message || null,
    refetch: query.refetch,
  };
}
